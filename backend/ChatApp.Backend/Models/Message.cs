namespace ChatApp.Backend.Models;

public enum MessageType
{
    Connect,
    Handshake,
    Chat,
    Typing,
    Error
}

public class ChatMessage
{
    public MessageType Type { get; set; }
    public string SenderId { get; set; } = string.Empty;
    public string ReceiverId { get; set; } = string.Empty;
    public string Data { get; set; } = string.Empty; // Encrypted for chat messages
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public class ErrorMessage
{
    public string ErrorCode { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}

public class PresenceStatus
{
    public string UserId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty; // "online", "offline", "inactive"
    public DateTime LastSeen { get; set; } = DateTime.UtcNow;
}