using System.Collections;
using System.Reflection;
using System.Security.Claims;
using ChatApp.Backend.Hubs;
using ChatApp.Backend.Models;
using Microsoft.AspNetCore.SignalR;
using Xunit;

namespace ChatApp.Backend.Tests;

/// <summary>
/// Unit tests for ChatHub covering validation, routing, presence updates,
/// and disconnect behavior in a controlled in-memory SignalR setup.
/// </summary>
public class ChatHubTests
{
    [Fact]
    public async Task SendMessage_InvalidType_SendsErrorToCaller()
    {
        ResetHubState();
        var caller = new RecordingClientProxy();
        const string connectionId = "alice-conn";
        var hub = CreateHub(connectionId, caller);

        SeedConnectedUser("alice", connectionId);
        await hub.SendMessage(new ChatMessage
        {
            Type = "bad-type",
            SenderId = "alice",
            ReceiverId = "bob",
            Data = "ciphertext"
        });

        var error = AssertProtocolMessage(caller, "ReceiveMessage", "error");
        Assert.Contains("\"errorCode\":\"INVALID_TYPE\"", error.Data);
    }

    [Fact]
    public async Task SendMessage_SenderMismatch_SendsErrorToCaller()
    {
        ResetHubState();
        var caller = new RecordingClientProxy();
        const string connectionId = "alice-conn";
        var hub = CreateHub(connectionId, caller);

        SeedConnectedUser("alice", connectionId);
        await hub.SendMessage(new ChatMessage
        {
            Type = "chat",
            SenderId = "mallory",
            ReceiverId = "bob",
            Data = "ciphertext",
            MessageId = "msg-1"
        });

        var error = AssertProtocolMessage(caller, "ReceiveMessage", "error");
        Assert.Contains("\"errorCode\":\"SENDER_MISMATCH\"", error.Data);
    }

    [Fact]
    public async Task SendMessage_OfflineRecipient_SendsErrorToCaller()
    {
        ResetHubState();
        var caller = new RecordingClientProxy();
        const string connectionId = "alice-conn";
        var hub = CreateHub(connectionId, caller);

        SeedConnectedUser("alice", connectionId);
        await hub.SendMessage(new ChatMessage
        {
            Type = "chat",
            SenderId = "alice",
            ReceiverId = "bob",
            Data = "ciphertext",
            MessageId = "msg-2"
        });

        var error = AssertProtocolMessage(caller, "ReceiveMessage", "error");
        Assert.Contains("\"errorCode\":\"RECIPIENT_OFFLINE\"", error.Data);
    }

    [Fact]
    public async Task SendMessage_ValidMessage_ForwardsToRecipientOnly()
    {
        ResetHubState();
        var aliceCaller = new RecordingClientProxy();
        var bobCaller = new RecordingClientProxy();
        var routedClients = new Dictionary<string, RecordingClientProxy>
        {
            ["alice-conn"] = aliceCaller,
            ["bob-conn"] = bobCaller
        };

        const string aliceConnectionId = "alice-conn";
        const string bobConnectionId = "bob-conn";
        var aliceHub = CreateHub(aliceConnectionId, aliceCaller, routedClients: routedClients);
        _ = CreateHub(bobConnectionId, bobCaller, routedClients: routedClients);

        SeedConnectedUser("alice", aliceConnectionId);
        SeedConnectedUser("bob", bobConnectionId);

        var message = new ChatMessage
        {
            Type = "chat",
            SenderId = "alice",
            ReceiverId = "bob",
            Data = "{\"ciphertext\":\"abc\",\"iv\":\"def\",\"tag\":\"\"}",
            MessageId = "msg-3"
        };

        await aliceHub.SendMessage(message);

        var forwarded = AssertSinglePayload<ChatMessage>(bobCaller, "ReceiveMessage");
        Assert.Equal(message.Data, forwarded.Data);
        Assert.DoesNotContain(aliceCaller.Messages, m => m.Method == "ReceiveMessage" && IsErrorMessage(m));
    }

    [Fact]
    public async Task SendMessage_ChatWithoutMessageId_SendsErrorToCaller()
    {
        ResetHubState();
        var caller = new RecordingClientProxy();
        const string connectionId = "alice-conn";
        var hub = CreateHub(connectionId, caller);

        SeedConnectedUser("alice", connectionId);
        await hub.SendMessage(new ChatMessage
        {
            Type = "chat",
            SenderId = "alice",
            ReceiverId = "bob",
            Data = "ciphertext"
        });

        var error = AssertProtocolMessage(caller, "ReceiveMessage", "error");
        Assert.Contains("\"errorCode\":\"INVALID_MESSAGE_ID\"", error.Data);
    }

    [Fact]
    public async Task SendMessage_PayloadTooLarge_SendsErrorToCaller()
    {
        ResetHubState();
        var caller = new RecordingClientProxy();
        const string connectionId = "alice-conn";
        var hub = CreateHub(connectionId, caller);

        SeedConnectedUser("alice", connectionId);
        await hub.SendMessage(new ChatMessage
        {
            Type = "chat",
            SenderId = "alice",
            ReceiverId = "bob",
            MessageId = "msg-too-large",
            Data = new string('x', 9000)
        });

        var error = AssertProtocolMessage(caller, "ReceiveMessage", "error");
        Assert.Contains("\"errorCode\":\"PAYLOAD_TOO_LARGE\"", error.Data);
    }

    [Fact]
    public async Task UpdatePresence_InvalidStatus_SendsErrorToCaller()
    {
        ResetHubState();
        var caller = new RecordingClientProxy();
        const string connectionId = "alice-conn";
        var hub = CreateHub(connectionId, caller);

        SeedConnectedUser("alice", connectionId);
        await hub.UpdatePresence("away");

        var error = AssertProtocolMessage(caller, "ReceiveMessage", "error");
        Assert.Contains("\"errorCode\":\"INVALID_PRESENCE\"", error.Data);
    }

    [Fact]
    public async Task SendMessage_ConnectEnvelope_ForwardsToRecipientOnly()
    {
        ResetHubState();
        var aliceCaller = new RecordingClientProxy();
        var bobCaller = new RecordingClientProxy();
        var routedClients = new Dictionary<string, RecordingClientProxy>
        {
            ["alice-conn"] = aliceCaller,
            ["bob-conn"] = bobCaller
        };

        const string aliceConnectionId = "alice-conn";
        const string bobConnectionId = "bob-conn";
        var aliceHub = CreateHub(aliceConnectionId, aliceCaller, routedClients: routedClients);

        SeedConnectedUser("alice", aliceConnectionId);
        SeedConnectedUser("bob", bobConnectionId);

        await aliceHub.SendMessage(new ChatMessage
        {
            Type = "connect",
            SenderId = "alice",
            ReceiverId = "bob",
            Data = "{\"status\":\"connected\"}"
        });

        var connect = AssertProtocolMessage(bobCaller, "ReceiveMessage", "connect");
        Assert.Equal("{\"status\":\"connected\"}", connect.Data);
    }

    [Fact]
    public async Task SendMessage_TypingEnvelope_ForwardsToRecipientOnly()
    {
        ResetHubState();
        var aliceCaller = new RecordingClientProxy();
        var bobCaller = new RecordingClientProxy();
        var routedClients = new Dictionary<string, RecordingClientProxy>
        {
            ["alice-conn"] = aliceCaller,
            ["bob-conn"] = bobCaller
        };

        const string aliceConnectionId = "alice-conn";
        const string bobConnectionId = "bob-conn";
        var aliceHub = CreateHub(aliceConnectionId, aliceCaller, routedClients: routedClients);

        SeedConnectedUser("alice", aliceConnectionId);
        SeedConnectedUser("bob", bobConnectionId);

        await aliceHub.SendMessage(new ChatMessage
        {
            Type = "typing",
            SenderId = "alice",
            ReceiverId = "bob",
            Data = "{\"isTyping\":true}"
        });

        var typing = AssertProtocolMessage(bobCaller, "ReceiveMessage", "typing");
        Assert.Equal("{\"isTyping\":true}", typing.Data);
    }

    [Fact]
    public async Task UpdatePresence_ValidStatus_BroadcastsPresence()
    {
        ResetHubState();
        var aliceCaller = new RecordingClientProxy();
        var aliceOthers = new RecordingClientProxy();
        var bobCaller = new RecordingClientProxy();
        var routedClients = new Dictionary<string, RecordingClientProxy>
        {
            ["alice-conn"] = aliceCaller,
            ["bob-conn"] = bobCaller
        };

        const string aliceConnectionId = "alice-conn";
        const string bobConnectionId = "bob-conn";
        var aliceHub = CreateHub(aliceConnectionId, aliceCaller, aliceOthers, routedClients);
        _ = CreateHub(bobConnectionId, bobCaller, routedClients: routedClients);

        SeedConnectedUser("alice", aliceConnectionId);
        SeedConnectedUser("bob", bobConnectionId);
        await aliceHub.UpdatePresence("inactive");

        var presence = AssertSinglePayload<PresenceStatus>(aliceOthers, "UserPresence");
        Assert.Equal("alice", presence.UserId);
        Assert.Equal("inactive", presence.Status);
    }

    [Fact]
    public async Task OnDisconnected_LastConnection_BroadcastsOfflinePresence()
    {
        ResetHubState();
        var caller = new RecordingClientProxy();
        var others = new RecordingClientProxy();
        const string connectionId = "alice-conn";
        var hub = CreateHub(connectionId, caller, others);

        SeedConnectedUser("alice", connectionId);
        await hub.OnDisconnectedAsync(null);

        var presence = AssertSinglePayload<PresenceStatus>(others, "UserPresence");
        Assert.Equal("alice", presence.UserId);
        Assert.Equal("offline", presence.Status);
    }

    [Fact]
    public async Task OnDisconnected_UnknownConnection_DoesNotThrow()
    {
        ResetHubState();
        var hub = CreateHub("unknown-conn", new RecordingClientProxy());

        await hub.OnDisconnectedAsync(null);
    }

    private static ChatHub CreateHub(
        string connectionId,
        RecordingClientProxy caller,
        RecordingClientProxy? others = null,
        IDictionary<string, RecordingClientProxy>? routedClients = null)
    {
        return new ChatHub
        {
            Context = new TestHubCallerContext(connectionId),
            Clients = new TestHubCallerClients(caller, others ?? new RecordingClientProxy(), routedClients)
        };
    }

    private static T AssertSinglePayload<T>(RecordingClientProxy proxy, string methodName)
    {
        var invocation = Assert.Single(proxy.Messages, m => m.Method == methodName);
        var payload = Assert.Single(invocation.Arguments);
        return Assert.IsType<T>(payload);
    }

    private static ChatMessage AssertProtocolMessage(RecordingClientProxy proxy, string methodName, string expectedType)
    {
        var payload = AssertSinglePayload<ChatMessage>(proxy, methodName);
        Assert.Equal(expectedType, payload.Type);
        return payload;
    }

    private static bool IsErrorMessage(ClientInvocation invocation)
    {
        return invocation.Arguments.SingleOrDefault() is ChatMessage message &&
               string.Equals(message.Type, "error", StringComparison.Ordinal);
    }

    private static void ResetHubState()
    {
        ClearStaticDictionary("UserByConnectionId");
        ClearStaticDictionary("ConnectionsByUserId");
        ClearStaticDictionary("PresenceByUserId");
    }

    private static void SeedConnectedUser(string userId, string connectionId)
    {
        var userByConnectionId = GetStaticField<System.Collections.Concurrent.ConcurrentDictionary<string, string>>("UserByConnectionId");
        var connectionsByUserId = GetStaticField<System.Collections.Concurrent.ConcurrentDictionary<string, System.Collections.Concurrent.ConcurrentDictionary<string, byte>>>("ConnectionsByUserId");
        var presenceByUserId = GetStaticField<System.Collections.Concurrent.ConcurrentDictionary<string, PresenceStatus>>("PresenceByUserId");

        userByConnectionId[connectionId] = userId;
        connectionsByUserId[userId] = new System.Collections.Concurrent.ConcurrentDictionary<string, byte>(
            new[] { new KeyValuePair<string, byte>(connectionId, 0) });
        presenceByUserId[userId] = new PresenceStatus
        {
            UserId = userId,
            Status = "online",
            LastSeen = DateTime.UtcNow
        };
    }

    private static void ClearStaticDictionary(string fieldName)
    {
        var value = GetStaticField<object>(fieldName);

        if (value is IDictionary dictionary)
        {
            dictionary.Clear();
            return;
        }

        var clearMethod = value.GetType().GetMethod("Clear", BindingFlags.Instance | BindingFlags.Public)
            ?? throw new InvalidOperationException($"Field '{fieldName}' does not support Clear().");
        clearMethod.Invoke(value, []);
    }

    private static T GetStaticField<T>(string fieldName)
    {
        var field = typeof(ChatHub).GetField(fieldName, BindingFlags.Static | BindingFlags.NonPublic)
            ?? throw new InvalidOperationException($"Field '{fieldName}' not found.");
        var value = field.GetValue(null) ?? throw new InvalidOperationException($"Field '{fieldName}' is null.");
        return (T)value;
    }

    /// <summary>
    /// Test double that records hub client invocations for later assertions.
    /// </summary>
    private sealed class RecordingClientProxy : IClientProxy
    {
        public List<ClientInvocation> Messages { get; } = [];

        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            Messages.Add(new ClientInvocation(method, args));
            return Task.CompletedTask;
        }
    }

    /// <summary>
    /// Captured method call sent by the hub to a client proxy.
    /// </summary>
    private sealed record ClientInvocation(string Method, object?[] Arguments);

    /// <summary>
    /// Minimal implementation of IHubCallerClients used to route messages
    /// to caller/others/specific connection proxies during tests.
    /// </summary>
    private sealed class TestHubCallerClients(
        RecordingClientProxy caller,
        RecordingClientProxy others,
        IDictionary<string, RecordingClientProxy>? routedClients) : IHubCallerClients
    {
        public IClientProxy All => throw new NotSupportedException();
        public IClientProxy Caller => caller;
        public IClientProxy Others => others;
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => throw new NotSupportedException();
        public IClientProxy Client(string connectionId)
        {
            if (routedClients is null || !routedClients.TryGetValue(connectionId, out var proxy))
            {
                return new MultiClientProxy([]);
            }

            return proxy;
        }
        public IClientProxy Clients(IReadOnlyList<string> connectionIds)
        {
            if (routedClients is null)
            {
                return others;
            }

            // Mirror SignalR fan-out by resolving each requested connection ID
            // to the recording proxy that represents that recipient.
            var proxies = connectionIds
                .Select(connectionId => routedClients.TryGetValue(connectionId, out var proxy) ? proxy : null)
                .Where(proxy => proxy is not null)
                .Cast<RecordingClientProxy>()
                .ToArray();

            return new MultiClientProxy(proxies);
        }
        public IClientProxy Group(string groupName) => throw new NotSupportedException();
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => throw new NotSupportedException();
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => throw new NotSupportedException();
        public IClientProxy OthersInGroup(string groupName) => throw new NotSupportedException();
        public IClientProxy User(string userId) => throw new NotSupportedException();
        public IClientProxy Users(IReadOnlyList<string> userIds) => throw new NotSupportedException();
    }

    /// <summary>
    /// Composite client proxy that forwards the same invocation
    /// to multiple recording client proxies.
    /// </summary>
    private sealed class MultiClientProxy(params RecordingClientProxy[] proxies) : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            foreach (var proxy in proxies)
            {
                proxy.Messages.Add(new ClientInvocation(method, args));
            }

            return Task.CompletedTask;
        }
    }

    /// <summary>
    /// Lightweight HubCallerContext implementation for unit testing hub methods
    /// without an actual SignalR transport.
    /// </summary>
    private sealed class TestHubCallerContext(string connectionId) : HubCallerContext
    {
        private readonly IDictionary<object, object?> _items = new Dictionary<object, object?>();
        private readonly Microsoft.AspNetCore.Http.Features.IFeatureCollection _features = new Microsoft.AspNetCore.Http.Features.FeatureCollection();

        public override string ConnectionId => connectionId;
        public override string? UserIdentifier => null;
        public override ClaimsPrincipal? User => null;
        public override IDictionary<object, object?> Items => _items;
        public override Microsoft.AspNetCore.Http.Features.IFeatureCollection Features => _features;
        public override CancellationToken ConnectionAborted => CancellationToken.None;

        public override void Abort()
        {
        }
    }
}
