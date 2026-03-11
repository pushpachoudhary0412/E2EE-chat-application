using Microsoft.AspNetCore.SignalR;
using ChatApp.Backend.Models;
using System.Collections.Concurrent;

namespace ChatApp.Backend.Hubs;

public class ChatHub : Hub
{
    private static readonly ConcurrentDictionary<string, string> _userConnections = new();
    private static readonly ConcurrentDictionary<string, PresenceStatus> _userPresence = new();

    public override async Task OnConnectedAsync()
    {
        var userId = Context.GetHttpContext()?.Request.Query["userId"].ToString() ?? Guid.NewGuid().ToString();
        _userConnections[Context.ConnectionId] = userId;

        var presence = new PresenceStatus
        {
            UserId = userId,
            Status = "online",
            LastSeen = DateTime.UtcNow
        };
        _userPresence[userId] = presence;

        await Clients.Others.SendAsync("UserPresence", presence);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (_userConnections.TryRemove(Context.ConnectionId, out var userId))
        {
            if (_userPresence.TryGetValue(userId, out var presence))
            {
                presence.Status = "offline";
                presence.LastSeen = DateTime.UtcNow;
                await Clients.Others.SendAsync("UserPresence", presence);
            }
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task SendMessage(ChatMessage message)
    {
        // Validate message format
        if (string.IsNullOrEmpty(message.SenderId) ||
            message.Data == null)
        {
            await Clients.Caller.SendAsync("ReceiveError", new ErrorMessage
            {
                ErrorCode = "INVALID_MESSAGE",
                Message = "Message format is invalid"
            });
            return;
        }

        // Server doesn't decrypt - just forwards the encrypted data
        await Clients.Others.SendAsync("ReceiveMessage", message);
    }

    public async Task SendTyping(string userId)
    {
        Console.WriteLine($"[ChatHub] SendTyping called by userId: {userId}");
        await Clients.Others.SendAsync("UserTyping", userId);
        Console.WriteLine($"[ChatHub] Broadcasted UserTyping event to others");
    }

    public async Task StopTyping(string userId)
    {
        Console.WriteLine($"[ChatHub] StopTyping called by userId: {userId}");
        await Clients.Others.SendAsync("UserStoppedTyping", userId);
        Console.WriteLine($"[ChatHub] Broadcasted UserStoppedTyping event to others");
    }

    public async Task UpdatePresence(string status)
    {
        if (_userConnections.TryGetValue(Context.ConnectionId, out var userId))
        {
            if (_userPresence.TryGetValue(userId, out var presence))
            {
                presence.Status = status;
                presence.LastSeen = DateTime.UtcNow;
                await Clients.Others.SendAsync("UserPresence", presence);
            }
        }
    }
}