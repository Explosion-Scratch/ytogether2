class PeerConnectionManager {
  /**
   * Create a new PeerConnectionManager that uses SignalDrone for signaling.
   * @param {Object} [options]
   * @param {Object} [options.user] - Your user information.
   * @param {boolean} [options.log] - Enable logging.
   * @param {string} [options.channelId] - Your ScaleDrone channelID (default provided).
   * @param {Object} [options.config] - ICE configuration for RTCPeerConnection.
   */
  constructor(options = {}) {
    /** @private */
    this._drone = null; // ScaleDrone instance
    /** @private */
    this._room = null; // ScaleDrone room subscription
    /** @private */
    this._roomName = null; // Room name used to signal (e.g. "observable-<roomId>")
    /** @private */
    this._pc = null; // RTCPeerConnection object
    /** @private */
    this._dataChannel = null; // RTCDataChannel
    /** @private */
    this._eventListeners = {
      data: [],
      connect: [],
      close: [],
    };
    /** @private */
    this._roomId = null; // Our unique room id string
    /** @private */
    this._user = options.user || { nickname: "Anonymous" };
    /** @private */
    this._enableLogging = options.log || false;
    /** @private */
    // Use provided ScaleDrone channel ID or default one for testing.
    this._channelId = options.channelId || "2KP3r0uhxHCjago8";
    /** @private */
    // ICE servers configuration; you can extend this list as needed.
    this._config = options.config || {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    };

    /** @private */
    // A promise that resolves when the negotiation is completed.
    this._loadPromise = new Promise((resolve, reject) => {
      this._loadPromiseResolve = resolve;
      this._loadPromiseReject = reject;
    });
  }

  /**
   * Log messages if logging is enabled.
   * @param {string} message
   * @param {*} [data]
   * @private
   */
  _log(message, data) {
    if (this._enableLogging) {
      const userStr = JSON.stringify(this._user);
      if (data !== undefined) {
        console.log(
          `[SignalDronePeerConnectionManager][${userStr}] ${message}`,
          data,
        );
      } else {
        console.log(
          `[SignalDronePeerConnectionManager][${userStr}] ${message}`,
        );
      }
    }
  }

  /**
   * Create a new room. This method creates a new unique room id, subscribes to it,
   * and sets up the WebRTC connection as the “host” (answerer).
   * @returns {Promise<string>} The room id.
   */
  createRoom() {
    return new Promise((resolve, reject) => {
      // Generate a unique room id (e.g. a random hex string)
      this._roomId = Math.floor(Math.random() * 0xffffff).toString(16);
      this._roomName = "observable-" + this._roomId;

      this._log("Creating a new room with id", this._roomId);
      // Create a new ScaleDrone (SignalDrone) instance.
      this._drone = new ScaleDrone(this._channelId);

      // When connected to the ScaleDrone service:
      this._drone.on("open", (error) => {
        if (error) {
          this._log("ScaleDrone connection error:", error);
          this._loadPromiseReject(error);
          return reject(error);
        }
        // Subscribe to the room.
        this._room = this._drone.subscribe(this._roomName);
        this._room.on("open", (error) => {
          if (error) {
            this._log("Room subscription error:", error);
            this._loadPromiseReject(error);
            return reject(error);
          }
          this._log("Subscribed to room", this._roomName);
        });

        // Wait for members event. (Members will be an array of connected clients.)
        this._room.on("members", (members) => {
          this._log("Members in room:", members);
          // When the room is created the first member is you.
          // We set isOfferer to false if you are the first (host) and true if second.
          const isOfferer = members.length === 2;
          this._startWebRTC(isOfferer);
          // Resolve the promise once our local description is ready.
          // (When the data channel opens, we will trigger our “connect” event.)
          this._loadPromiseResolve();
          resolve(this._roomId);
        });

        // Listen for signaling messages
        this._startListeningToSignals();
      });

      this._drone.on("error", (error) => {
        this._log("ScaleDrone error:", error);
        this._loadPromiseReject(error);
        reject(error);
      });
    });
  }

  /**
   * Join an existing room.
   * @param {string} roomId - The id of the room (without the prefix).
   * @returns {Promise<void>}
   */
  joinRoom(roomId) {
    return new Promise((resolve, reject) => {
      this._roomId = roomId;
      this._roomName = "observable-" + roomId;

      this._log("Joining room", this._roomId);
      // Create a new ScaleDrone instance.
      this._drone = new ScaleDrone(this._channelId);

      this._drone.on("open", (error) => {
        if (error) {
          this._log("ScaleDrone connection error:", error);
          this._loadPromiseReject(error);
          return reject(error);
        }

        // Subscribe to the same room.
        this._room = this._drone.subscribe(this._roomName);
        this._room.on("open", (error) => {
          if (error) {
            this._log("Room subscription error:", error);
            this._loadPromiseReject(error);
            return reject(error);
          }
          this._log("Subscribed to room", this._roomName);
        });

        // Wait for the members event.
        this._room.on("members", (members) => {
          this._log("Members in room:", members);
          // If room is full (more than 2), reject.
          if (members.length > 2) {
            const err = new Error("Room is full");
            this._loadPromiseReject(err);
            return reject(err);
          }
          // If you are the second member, then you’re the offerer.
          const isOfferer = members.length === 2;
          this._startWebRTC(isOfferer);
          this._loadPromiseResolve();
          resolve();
        });

        // Listen for signaling messages.
        this._startListeningToSignals();
      });

      this._drone.on("error", (error) => {
        this._log("ScaleDrone error:", error);
        this._loadPromiseReject(error);
        reject(error);
      });
    });
  }

  /**
   * Internal function to start the WebRTC connection.
   * @param {boolean} isOfferer - If true, create the offer and data channel.
   * @private
   */
  _startWebRTC(isOfferer) {
    this._log("Starting WebRTC as", isOfferer ? "offerer" : "answerer");
    // Create the RTCPeerConnection.
    this._pc = new RTCPeerConnection(this._config);

    // Send any ICE candidates to the other peer.
    this._pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._sendSignalMessage({ candidate: event.candidate });
      }
    };

    if (isOfferer) {
      // As the offerer, create a data channel and set up negotiation.
      this._dataChannel = this._pc.createDataChannel("chat");
      this._setupDataChannel();

      // When negotiation is needed, create an offer.
      this._pc.onnegotiationneeded = () => {
        this._pc
          .createOffer()
          .then((offer) => this._localDescCreated(offer))
          .catch((err) => {
            this._log("Error creating offer:", err);
            this._loadPromiseReject(err);
          });
      };
    } else {
      // As answerer, wait for the remote offer (data channel will be set automatically).
      this._pc.ondatachannel = (event) => {
        this._dataChannel = event.channel;
        this._setupDataChannel();
      };
    }
  }

  /**
   * Set up event handlers on the RTCDataChannel.
   * @private
   */
  _setupDataChannel() {
    if (!this._dataChannel) return;
    this._log("Setting up data channel", this._dataChannel.label);

    // Handle open event.
    this._dataChannel.onopen = () => {
      this._log("Data channel open");
      // Fire "connect" listener callbacks.
      this._eventListeners.connect.forEach((cb) => cb());
    };

    // Handle close event.
    this._dataChannel.onclose = () => {
      this._log("Data channel closed");
      this._eventListeners.close.forEach((cb) => cb());
    };

    // Handle incoming messages.
    this._dataChannel.onmessage = (event) => {
      try {
        const { data, user } = JSON.parse(event.data);
        this._log("Received data", { data, user });
        this._eventListeners.data.forEach((cb) => cb(data, user));
      } catch (err) {
        this._log("Error parsing incoming message", err);
      }
    };
  }

  /**
   * Listen to signaling messages coming in from ScaleDrone.
   * @private
   */
  _startListeningToSignals() {
    if (!this._room) return;
    this._room.on("data", (message, client) => {
      // Ignore messages sent by ourselves.
      if (client.id === this._drone.clientId) return;

      // If the message contains an SDP, set it as remote description.
      if (message.sdp) {
        this._log("Received SDP message", message.sdp);
        const desc = message.sdp;
        this._pc
          .setRemoteDescription(new RTCSessionDescription(desc))
          .then(() => {
            // If received an offer, then answer it.
            if (desc.type === "offer") {
              this._pc
                .createAnswer()
                .then((answer) => this._localDescCreated(answer))
                .catch((err) => {
                  this._log("Error creating answer:", err);
                  this._loadPromiseReject(err);
                });
            }
          })
          .catch((err) => {
            this._log("Error setting remote description:", err);
          });
      } else if (message.candidate) {
        // Add ICE candidate.
        this._log("Received ICE candidate", message.candidate);
        this._pc
          .addIceCandidate(new RTCIceCandidate(message.candidate))
          .catch((err) => {
            this._log("Error adding received ICE candidate", err);
          });
      }
    });
  }

  /**
   * Set the local description and send it over signaling.
   * @param {RTCSessionDescriptionInit} desc
   * @private
   */
  _localDescCreated(desc) {
    this._pc
      .setLocalDescription(desc)
      .then(() => {
        // Send the SDP (offer/answer) to the other peer.
        this._sendSignalMessage({ sdp: this._pc.localDescription });
      })
      .catch((err) => {
        this._log("Error setting local description:", err);
        this._loadPromiseReject(err);
      });
  }

  /**
   * Send a signaling message via ScaleDrone.
   * @param {Object} message
   * @private
   */
  _sendSignalMessage(message) {
    if (this._drone && this._roomName) {
      this._drone.publish({ room: this._roomName, message });
      this._log("Sent signal message", message);
    }
  }

  /**
   * Send data over the data channel.
   * @param {*} data - Data to send.
   */
  async send(data) {
    // Ensure that connection is ready.
    await this._loadPromise;

    if (!this._dataChannel || this._dataChannel.readyState !== "open") {
      throw new Error("Data channel is not open");
    }

    const payload = {
      data,
      user: this._user,
    };

    this._log("Sending data", payload);
    this._dataChannel.send(JSON.stringify(payload));
  }

  /**
   * Register an event listener.
   * @param {'data'|'connect'|'close'} event - Event name.
   * @param {Function} callback - Callback function.
   */
  on(event, callback) {
    if (!this._eventListeners[event]) {
      throw new Error(`Unsupported event: ${event}`);
    }
    this._log(`Registered listener for event: ${event}`);
    this._eventListeners[event].push(callback);
  }

  /**
   * Close all connections and clean up.
   */
  close() {
    this._log("Closing connections and cleaning up");
    if (this._dataChannel) {
      this._dataChannel.close();
      this._dataChannel = null;
    }
    if (this._pc) {
      this._pc.close();
      this._pc = null;
    }
    if (this._room) {
      this._room.removeAllListeners();
      this._room = null;
    }
    if (this._drone) {
      this._drone.close();
      this._drone = null;
    }
  }

  /**
   * Get the current room ID.
   * @returns {string|null}
   */
  getId() {
    return this._roomId;
  }

  /**
   * Get user info.
   * @returns {Object}
   */
  getUser() {
    return this._user;
  }
}

// Export a singleton instance if desired.
const peerService = new PeerConnectionManager({
  user: { name: "User " + Math.random().toString(36).substring(2, 15) },
  log: true,
});

export default peerService;
