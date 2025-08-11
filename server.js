const WebSocket = require("ws");
require("dotenv").config();
const axios = require("axios");

const WS_PORT = process.env.WS_PORT || 8080;

const API_URL = process.env.API_URL || "http://localhost:8000/api";
const AUTH_CHECK_URL =
  process.env.AUTH_CHECK_URL || `${API_URL}/auth/light-user`;

const axiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`WebSocket server started on port ${WS_PORT}`);

const connectedClients = new Map(); // Map<user_id, Set<WebSocket>>

wss.on("connection", async (ws, req) => {
  console.log("Client connected.");

  const urlParams = new URLSearchParams(req.url.split("?")[1]);
  const id = parseInt(urlParams.get("id"));

  if (!connectedClients.has(id)) {
    connectedClients.set(id, new Set());
    ``;
  }
  connectedClients.get(id).add(ws);

  ws.on("message", async (message) => {
    // Parse the message.
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      ws.send(JSON.stringify({ type: "ERROR", message: "Invalid JSON." }));
      return;
    }

    const notificationsMap = {
      SEND_MESSAGE: "NEW_MESSAGE",
      READ_MESSAGE: "MESSAGE_READ",
      RECEIVE_MESSAGE: "MESSAGE_RECEIVED",
      RECEIVE_LATEST_MESSAGES: "LATEST_MESSAGES_RECEIVED",
      READ_CHAT_LATEST_MESSAGES: "CHAT_LATEST_MESSAGES_READ",
      DELETE_MESSAGE: "MESSAGE_DELETED",
      IAM_ONLINE: "USER_ONLINE",
      NOTIFY_MY_POSITION: "USER_POSITION",
    };

    console.log(data.payload);

    if (!Object.keys(notificationsMap).includes(data.type)) {
      ws.send(
        JSON.stringify({ type: "ERROR", message: "Unknow notification type" })
      );
      return;
    }
    // Notify the listeners.
    try {
      if (data.hasOwnProperty("broadcast")) {
        // if the data contains the boardcast attribute this means that we want to send to all the connected clients.
        connectedClients.forEach((clientList) => {
          clientList.forEach((clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: notificationsMap[data.type],
                  payload: data.payload,
                })
              );
            }
          });
        });
      } else {
        // Else we send only to the authorize listeners.
        console.log(data.listeners);
        data.listeners.forEach((targetUserId) => {
          if (
            targetUserId !== ws.userId &&
            connectedClients.has(targetUserId)
          ) {
            connectedClients.get(targetUserId).forEach((clientWs) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: notificationsMap[data.type],
                    payload: data.payload,
                  })
                );
              }
            });
          }
        });
      }
    } catch (error) {
      console.error(
        `Failed to notify: `,
        error.response?.status,
        error.response?.data?.message || error.message
      );
      ws.send(
        JSON.stringify({
          type: "ERROR",
          message: `Failed to notify ${data.type}`,
        })
      );
    }
  });

  ws.on("close", () => {
    if (ws.userId && connectedClients.has(ws.userId)) {
      const userSockets = connectedClients.get(ws.userId);
      userSockets.delete(ws);
      if (userSockets.size === 0) {
        connectedClients.delete(ws.userId);
      }
    }
  });

  ws.on("error", (error) => {
    console.error(
      `WebSocket error for User ID ${ws.userId || "N/A"}:`,
      error.message
    );
  });
});
