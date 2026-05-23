export interface PartyMember {
  account_id: string;
  role: string;
  meta: { [key: string]: any };
  connections: string;
  revision: number;
  updated_at: string;
  joined_at: string;
}

export interface PartyMemberConnection {
  id: string;
  connected_at: string;
  updated_at: string;
  yield_leadership: boolean;
  meta: { [key: string]: any };
}

export interface PartyInvite {
  party_id: string;
  sent_by: string;
  meta: any;
  sent_to: string;
  sent_at: string;
  updated_at: string;
  expires_at: string;
  status: string;
}

export interface Parties {
  partyId: string;
  createdAt: string;
  updatedAt: string;
  config: string;
  members: PartyMember[];
  applicants: string[];
  meta: string;
  revision: number;
  intentions: string[];
}

export interface Pings {
  sentBy: string;
  meta: string;
  sentTo: string;
  sentAt: string;
  expiresAt: string;
}

export interface Invites {
  partyId: string;
  sentBy: string;
  meta: string;
  sentTo: string;
  sentAt: string;
  updatedAt: string;
  expiresAt: string;
  status: string;
}
