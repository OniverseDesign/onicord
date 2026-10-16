
interface Channel {
  id: string
  type: 'text' | 'voice'
  name: string
}

interface SavedServer {
  id: string
  name: string
  roomCode: string
  isOwner: boolean
  icon?: string | null
  channels: Channel[]
  lastChannelId: string
  createdAt: number
  lastVisitedAt: number
}

interface UserProfile {
  nickname: string
  avatar: string | null
  updatedAt?: number
}

interface PeerInfo {
  id: string
  nickname: string
  avatar: string | null
}

interface ChatMessage {
  id: string
  roomCode: string
  channelId: string
  authorId: string
  authorNickname: string
  authorAvatar: string | null
  text: string
  timestamp: number
}

interface ElectronAPI {
  getProfile: () => Promise<UserProfile | null>
  saveProfile: (profile: UserProfile) => Promise<UserProfile>
  deleteAccount: () => Promise<{ success: boolean; error?: string }>
  createRoom: (profile: UserProfile) => Promise<{ code: string }>
  joinRoom: (code: string, profile: UserProfile) => Promise<{ code: string }>
  leaveRoom: () => Promise<{ ok: boolean }>
  getRoomState: () => Promise<{
    roomCode: string | null
    isHost: boolean
    peers: PeerInfo[]
  }>
  listServers: () => Promise<SavedServer[]>
  createServer: (name: string, profile: UserProfile) => Promise<SavedServer>
  joinServer: (code: string, name: string, profile: UserProfile) => Promise<SavedServer>
  enterServer: (serverId: string, profile: UserProfile) => Promise<SavedServer>
  removeServer: (serverId: string) => Promise<{ ok: boolean }>
  setServerChannel: (serverId: string, channelId: string) => Promise<SavedServer | null>
  updateServerSettings: (
    serverId: string,
    settings: { name?: string; icon?: string | null; channels?: Channel[] }
  ) => Promise<SavedServer>
  getChatHistory: (roomCode: string, channelId?: string) => Promise<ChatMessage[]>
  sendChatMessage: (roomCode: string, channelId: string, text: string) => Promise<ChatMessage>
  onPeerJoined: (callback: (peer: PeerInfo) => void) => () => void
  onPeerLeft: (callback: (data: { id: string }) => void) => () => void
  onRoomCreated: (callback: (data: { code: string }) => void) => () => void
  onRoomJoined: (callback: (data: { code: string }) => void) => () => void
  onP2PError: (callback: (message: string) => void) => () => void
  onChatMessage: (callback: (message: ChatMessage) => void) => () => void
  onSyncComplete: (callback: (data: SyncCompleteEvent) => void) => () => void
  onServerUpdated: (callback: (server: SavedServer) => void) => () => void
  joinVoice: (channelId: string) => Promise<VoiceStateSnapshot>
  leaveVoice: () => Promise<VoiceStateSnapshot>
  setVoiceMuted: (muted: boolean) => Promise<VoiceStateSnapshot>
  sendVoiceSignal: (toPeerId: string, channelId: string, signal: unknown) => Promise<{ ok: boolean }>
  getVoiceState: () => Promise<VoiceStateSnapshot>
  onVoiceState: (callback: (state: VoiceStateSnapshot) => void) => () => void
  onVoiceSignal: (callback: (data: VoiceSignalEvent) => void) => () => void
  onDeepLink?: (callback: (code: string) => void) => () => void
  checkPendingDeepLink?: () => Promise<string | null>
  resolveInvite?: (code: string, profile: UserProfile) => Promise<{
    roomCode: string
    name: string
    icon: string | null
    memberCount: number
    onlineCount: number
  }>
  cancelInviteResolve?: (code: string) => void
  onInviteDetailsUpdated?: (callback: (details: {
    roomCode: string
    name?: string
    icon?: string | null
    memberCount?: number
    onlineCount?: number
  }) => void) => () => void
}

interface VoiceMember {
  peerId: string
  channelId: string
  nickname: string
  avatar: string | null
  muted: boolean
  isSelf: boolean
}

interface VoiceStateSnapshot {
  localPeerId: string | null
  members: VoiceMember[]
}

interface VoiceSignalEvent {
  fromPeerId: string
  channelId: string
  signal: unknown
}

interface SyncCompleteEvent {
  peerId: string
  nickname: string
  messagesAdded: number
  filesAdded: number
}

interface Window {
  electronAPI?: ElectronAPI
}
