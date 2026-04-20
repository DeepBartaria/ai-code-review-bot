export interface ReviewSchema {
  bugs: string[];
  style: string[];
  security: string[];
  summary: string;
  score: number;
}

export type WSMessageFromClient = 
  | { type: 'review_request'; code: string; language: string };

export type WSMessageFromServer =
  | { type: 'connected'; sessionId: string }
  | { type: 'chunk'; data: any }
  | { type: 'complete'; review: ReviewSchema }
  | { type: 'error'; message: string };

export interface Session {
  id: string;
  language: string;
  code: string;
  timestamp: string;
  review?: ReviewSchema;
}
