using ChatApp.Backend.Models;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace ChatApp.Backend.Hubs;

/// <summary>
/// SignalR hub responsible for validating protocol envelopes, routing messages,
/// and broadcasting user presence updates between connected chat peers.
/// </summary>
public class ChatHub : Hub
{
    private const int MaxProtocolDataLength = 8192;

    private static readonly ConcurrentDictionary<string, string> UserByConnectionId = new();
    private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, byte>> ConnectionsByUserId = new();
    private static readonly ConcurrentDictionary<string, PresenceStatus> PresenceByUserId = new();
    private static readonly HashSet<string> AllowedMessageTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "connect",
        "handshake",
        "chat",
        "typing",
        "ack",
        "error"
    };
    private static readonly HashSet<string> AllowedPresenceStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "online",
        "offline",
        "inactive"
    };

    public override async Task OnConnectedAsync()
    {
        var userId = Context.GetHttpContext()?.Request.Query["userId"].ToString();
        if (string.IsNullOrWhiteSpace(userId))
        {
            Context.Abort();
            return;
        }

        UserByConnectionId[Context.ConnectionId] = userId;
        var connections = ConnectionsByUserId.GetOrAdd(userId, _ => new ConcurrentDictionary<string, byte>());
        connections[Context.ConnectionId] = 0;

        var presence = new PresenceStatus
        {
            UserId = userId,
            Status = "online",
            LastSeen = DateTime.UtcNow
        };
        PresenceByUserId[userId] = presence;

        foreach (var existingPresence in PresenceByUserId.Values.Where(p => p.UserId != userId))
        {
            await Clients.Caller.SendAsync("UserPresence", existingPresence);
        }

        await Clients.Others.SendAsync("UserPresence", presence);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (!UserByConnectionId.TryRemove(Context.ConnectionId, out var userId))
        {
            await base.OnDisconnectedAsync(exception);
            return;
        }

        if (ConnectionsByUserId.TryGetValue(userId, out var connections))
        {
            connections.TryRemove(Context.ConnectionId, out _);
            if (connections.IsEmpty)
            {
                ConnectionsByUserId.TryRemove(userId, out _);

                if (PresenceByUserId.TryGetValue(userId, out var presence))
                {
                    presence.Status = "offline";
                    presence.LastSeen = DateTime.UtcNow;
                    await Clients.Others.SendAsync("UserPresence", presence);
                }
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task SendMessage(ChatMessage message)
    {
        if (!TryValidateMessage(message, out var error))
        {
            await SendProtocolErrorToCaller(error);
            return;
        }

        if (!UserByConnectionId.TryGetValue(Context.ConnectionId, out var connectedUserId) ||
            !string.Equals(connectedUserId, message.SenderId, StringComparison.Ordinal))
        {
            await SendProtocolErrorToCaller(new ErrorMessage
            {
                ErrorCode = "SENDER_MISMATCH",
                Message = "Sender ID does not match the connected user."
            });
            return;
        }

        var recipientClients = GetClientsForUser(message.ReceiverId);
        if (recipientClients is null)
        {
            if (string.Equals(message.Type, "connect", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            await SendProtocolErrorToCaller(new ErrorMessage
            {
                ErrorCode = "RECIPIENT_OFFLINE",
                Message = "Recipient is not connected."
            });
            return;
        }

        await recipientClients.SendAsync("ReceiveMessage", message);
    }

    public async Task UpdatePresence(string status)
    {
        if (string.IsNullOrWhiteSpace(status) || !AllowedPresenceStatuses.Contains(status))
        {
            await SendProtocolErrorToCaller(new ErrorMessage
            {
                ErrorCode = "INVALID_PRESENCE",
                Message = "Presence status is invalid."
            });
            return;
        }

        if (UserByConnectionId.TryGetValue(Context.ConnectionId, out var userId) &&
            PresenceByUserId.TryGetValue(userId, out var presence))
        {
            presence.Status = status;
            presence.LastSeen = DateTime.UtcNow;
            await Clients.Others.SendAsync("UserPresence", presence);
        }
    }

    private static bool TryValidateMessage(ChatMessage? message, out ErrorMessage error)
    {
        if (message is null)
        {
            error = new ErrorMessage
            {
                ErrorCode = "INVALID_MESSAGE",
                Message = "Message payload is missing."
            };
            return false;
        }

        if (string.IsNullOrWhiteSpace(message.Type) ||
            !AllowedMessageTypes.Contains(message.Type))
        {
            error = new ErrorMessage
            {
                ErrorCode = "INVALID_TYPE",
                Message = "Message type is invalid."
            };
            return false;
        }

        if (string.IsNullOrWhiteSpace(message.SenderId))
        {
            error = new ErrorMessage
            {
                ErrorCode = "INVALID_SENDER",
                Message = "Sender ID is required."
            };
            return false;
        }

        if (string.IsNullOrWhiteSpace(message.ReceiverId))
        {
            error = new ErrorMessage
            {
                ErrorCode = "INVALID_RECEIVER",
                Message = "Receiver ID is required."
            };
            return false;
        }

        if (string.IsNullOrWhiteSpace(message.Data))
        {
            error = new ErrorMessage
            {
                ErrorCode = "INVALID_DATA",
                Message = "Message data is required."
            };
            return false;
        }

        if (message.Data.Length > MaxProtocolDataLength)
        {
            error = new ErrorMessage
            {
                ErrorCode = "PAYLOAD_TOO_LARGE",
                Message = $"Message data exceeds max allowed length of {MaxProtocolDataLength} characters."
            };
            return false;
        }

        if ((string.Equals(message.Type, "chat", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(message.Type, "ack", StringComparison.OrdinalIgnoreCase)) &&
            string.IsNullOrWhiteSpace(message.MessageId))
        {
            error = new ErrorMessage
            {
                ErrorCode = "INVALID_MESSAGE_ID",
                Message = "messageId is required for chat and ack messages."
            };
            return false;
        }

        error = new ErrorMessage();
        return true;
    }

    private IClientProxy? GetClientsForUser(string userId)
    {
        if (!ConnectionsByUserId.TryGetValue(userId, out var connections) || connections.IsEmpty)
        {
            return null;
        }

        return Clients.Clients(connections.Keys);
    }

    private Task SendProtocolErrorToCaller(ErrorMessage error)
    {
        UserByConnectionId.TryGetValue(Context.ConnectionId, out var userId);

        return Clients.Caller.SendAsync("ReceiveMessage", new ChatMessage
        {
            Type = "error",
            SenderId = "server",
            ReceiverId = userId ?? "unknown",
            Data = $$"""
                     {"errorCode":"{{error.ErrorCode}}","message":"{{error.Message}}"}
                     """,
            Timestamp = DateTime.UtcNow
        });
    }
}
