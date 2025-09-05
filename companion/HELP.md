## Holophonix Processor (WebSocket + OSC)

### Configuration

- WebSocket
  - WebSocket URL: The URL of the WebSocket server (must start with `ws://` or `wss://`).
  - WS Reconnect: Automatically reconnect on disconnect (5s backoff).
  - Append termination character: Optional CR/LF termination appended to sent strings.
  - Debug messages: Log incoming and outgoing WebSocket messages.
  - Reset variables: Reset dynamic variables on init and on connect.
  - Feedback Prefix/Suffix: Prepended/appended to JSON path for the "Update variable from WebSocket message" feedback.

- OSC (UDP)
  - Target Hostname or IP: Destination for OSC messages.
  - Target Port: Destination port for OSC messages.
  - Listen for OSC Feedback: Enable UDP listener to receive OSC messages.
  - Feedback Port: Local UDP port to listen for OSC messages.

### Available Actions

- WebSocket
  - WS: Send text

- OSC
  - OSC: Send message (no args)
  - OSC: Send integer
  - OSC: Send float
  - OSC: Send string

### Available Feedbacks

- WebSocket
  - Update variable with value from WebSocket message
    - JSON Path: Leave empty to copy the whole message. If set, interpreted as a JSON path. Prefix/Suffix from config are applied when path is not empty.
    - Variable: The target variable name for the value.

### Available Variables

- WebSocket
  - `lastDataReceived`: Unix timestamp when the last WS message was received.

- OSC
  - `latest_received_timestamp`: Latest OSC message received timestamp
  - `latest_received_raw`: Latest OSC message received
  - `latest_received_path`: Latest OSC command received
  - `latest_received_client`: Latest OSC message received client (UDP only)
  - `latest_received_port`: Latest OSC message received port (UDP only)
  - `latest_received_args`: Latest OSC arguments received array
  - `latest_sent_timestamp`: Latest OSC message sent timestamp
  - `latest_sent_raw`: Latest OSC message sent
  - `latest_sent_path`: Latest OSC command sent
  - `latest_sent_args`: Latest OSC arguments sent array
