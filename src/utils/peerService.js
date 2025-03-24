import Peer from "peerjs";

/**
 * A simplified abstraction layer for Peer.js to manage peer-to-peer connections
 * @class PeerConnectionManager
 */
class PeerConnectionManager {
  /**
   * Create a new PeerConnectionManager
   * @param {Object} [options] - Optional configuration for Peer.js
   * @param {Object} [options.user] - User information object
   */
  constructor(options = {}) {
    /** @private */
    this._peer = null;
    /** @private */
    this._connections = new Map();
    /** @private */
    this._eventListeners = {
      data: [],
      connect: [],
      close: [],
    };
    /** @private */
    this._roomId = null;
    /** @private */
    this._user = options.user || { nickname: "Anonymous" };
    /** @private */
    this._enableLogging = options.log || false;
    /** @private */
    this._options = {
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun.l.google.com:5349" },
          { urls: "stun:stun1.l.google.com:3478" },
          { urls: "stun:stun1.l.google.com:5349" },
          // { urls: "stun:stun2.l.google.com:19302" },
          // { urls: "stun:stun2.l.google.com:5349" },
          // { urls: "stun:stun3.l.google.com:3478" },
          // { urls: "stun:stun3.l.google.com:5349" },
          // { urls: "stun:stun4.l.google.com:19302" },
          // { urls: "stun:stun4.l.google.com:5349" },
        ],
      },
      debug: 1,
    };

    /** @private */
    this._loadPromiseResolve = null;
    /** @private */
    this._loadPromiseReject = null;
    /** @private */
    this._loadPromise = new Promise((resolve, reject) => {
      this._loadPromiseResolve = resolve;
      this._loadPromiseReject = reject;
    });
  }

  /**
   * @private
   * Log messages if logging is enabled
   * @param {string} message - The message to log
   * @param {*} [data] - Optional data to log
   */
  _log(message, data) {
    if (this._enableLogging) {
      const userStr = JSON.stringify(this._user);
      if (data !== undefined) {
        console.log(`[PeerConnectionManager][${userStr}] ${message}`, data);
      } else {
        console.log(`[PeerConnectionManager][${userStr}] ${message}`);
      }
    }
  }

  /**
   * Create a new room and return the room ID
   * @returns {Promise<string>} The unique room ID
   */
  createRoom() {
    return new Promise((resolve, reject) => {
      // Ensure any existing peer is closed
      if (this._peer) {
        this._peer.destroy();
      }

      this._log("Creating a new room...");

      // Create a new Peer with a random ID
      this._peer = new Peer(undefined, this._options);

      this._peer.on("open", (id) => {
        this._roomId = id;
        this._setupPeerListeners();
        this._log("Room created successfully", id);
        this._loadPromiseResolve();
        resolve(id);
      });

      this._peer.on("error", (err) => {
        this._log("Peer creation error:", err);
        console.error("Peer creation error:", err);
        this._loadPromiseReject(err);
        reject(err);
      });
    });
  }

  /**
   * Join an existing room
   * @param {string} roomId - The ID of the room to join
   * @returns {Promise<void>}
   */
  joinRoom(roomId) {
    return new Promise((resolve, reject) => {
      // Ensure any existing peer is closed
      if (this._peer) {
        this._peer.destroy();
      }

      this._log(`Joining room: ${roomId}`);

      // Create a new Peer
      this._peer = new Peer(undefined, this._options);

      this._peer.on("open", () => {
        this._roomId = roomId;

        // Explicitly initiate connection to the room host
        const connection = this._peer.connect(roomId);

        connection.on("open", () => {
          this._setupConnectionListeners(connection);
          this._connections.set(roomId, connection);
          this._log(`Successfully joined room: ${roomId}`);
          this._loadPromiseResolve();
          resolve();
        });

        connection.on("error", (err) => {
          this._log("Connection error:", err);
          console.error("Connection error:", err);
          this._loadPromiseReject(err);
          reject(err);
        });
      });

      this._peer.on("error", (err) => {
        this._log("Room join error:", err);
        console.error("Room join error:", err);
        this._loadPromiseReject(err);
        reject(err);
      });

      this._setupPeerListeners();
    });
  }

  /**
   * Send data to all connections in the room
   * @param {*} data - The data to send
   */
  async send(data) {
    if (!this._peer) {
      throw new Error("Not connected to a room");
    }

    await this._loadPromise;

    const dataWithUser = {
      data,
      user: this._user,
    };

    this._log("Sending data to all connections", dataWithUser);
    this._connections.forEach((connection) => {
      connection.send(dataWithUser);
    });
  }

  /**
   * Register an event listener
   * @param {'data'|'connect'|'close'} event - The event to listen for
   * @param {Function} callback - The callback function
   */
  on(event, callback) {
    if (!this._eventListeners[event]) {
      throw new Error(`Unsupported event: ${event}`);
    }
    this._log(`Registered listener for event: ${event}`);
    this._eventListeners[event].push(callback);
  }

  /**
   * Close the current connection and clean up
   */
  close() {
    if (this._peer) {
      this._log("Closing connections and cleaning up");
      this._peer.destroy();
      this._peer = null;
      this._connections.clear();
    }
  }

  /**
   * @private
   * Set up internal peer listeners for incoming connections
   */
  _setupPeerListeners() {
    // Handle incoming connections
    this._peer.on("connection", (connection) => {
      this._log(`New incoming connection from: ${connection.peer}`);
      this._setupConnectionListeners(connection);
    });
  }

  /**
   * @private
   * Set up listeners for a specific connection
   * @param {Object} connection - The peer connection object
   */
  _setupConnectionListeners(connection) {
    this._connections.set(connection.peer, connection);
    this._log(`Setting up listeners for connection: ${connection.peer}`);

    // Setup connection-specific listeners
    connection.on("data", (receivedData) => {
      const { data, user } = receivedData;
      this._log(`Received data from ${connection.peer}:`, receivedData);
      this._eventListeners.data.forEach((cb) =>
        cb(data, user, connection.peer),
      );
    });

    connection.on("open", () => {
      this._log(`Connection opened with: ${connection.peer}`);
      this._eventListeners.connect.forEach((cb) => cb(connection.peer));
    });

    connection.on("close", () => {
      this._log(`Connection closed with: ${connection.peer}`);
      this._connections.delete(connection.peer);
      this._eventListeners.close.forEach((cb) => cb(connection.peer));
    });
  }

  /**
   * Get the current room ID
   * @returns {string|null} The current room ID
   */
  getId() {
    return this._roomId;
  }

  /**
   * Get the user information
   * @returns {Object} The user information
   */
  getUser() {
    return this._user;
  }
}

const peerService = new PeerConnectionManager({
  user: { name: "User " + Math.random().toString(36).substring(2, 15) },
  log: true,
});

export default peerService;
/*


const manager = new PeerConnectionManager({
  user: { name: "Host" },
  log: true,
});
const roomId = await manager.createRoom();
console.log("Room created:", roomId);

// Joining a room
const otherManager = new PeerConnectionManager({
  user: { name: "Guest" },
  log: true,
});
await otherManager.joinRoom(roomId);

// Sending and receiving data
otherManager.on("data", (data, user, peer) => {
  console.log("Received:", data, "from: ", user, "peer: ", peer);
});

manager.on("connect", () => {
  manager.send({ message: "Hello, room!" });
});
*/
