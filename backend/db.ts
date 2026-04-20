import Database from 'better-sqlite3';
import path from 'path';

// Store DB in the directory so it persists in Railway's ephemeral disk as requested
const dbPath = path.resolve(__dirname, 'reviews.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    language TEXT,
    code TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reviews (
    session_id TEXT PRIMARY KEY,
    review_data TEXT, -- will store the JSON string of the review
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

export interface SessionRecord {
  id: string;
  language: string;
  code: string;
  timestamp: string;
}

export interface ReviewRecord {
  session_id: string;
  review_data: string;
}

export const createSession = (id: string, language: string, code: string) => {
  const stmt = db.prepare('INSERT INTO sessions (id, language, code) VALUES (?, ?, ?)');
  stmt.run(id, language, code);
};

export const saveReview = (sessionId: string, reviewData: any) => {
  const stmt = db.prepare('INSERT INTO reviews (session_id, review_data) VALUES (?, ?)');
  stmt.run(sessionId, JSON.stringify(reviewData));
};

export const getSessions = () => {
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY timestamp DESC');
  return stmt.all() as SessionRecord[];
};

export const getSessionById = (id: string) => {
  const sessionStmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const reviewStmt = db.prepare('SELECT * FROM reviews WHERE session_id = ?');

  const session = sessionStmt.get(id) as SessionRecord | undefined;
  if (!session) return null;

  const review = reviewStmt.get(id) as ReviewRecord | undefined;
  return {
    ...session,
    review: review ? JSON.parse(review.review_data) : null,
  };
};

export const deleteSession = (id: string) => {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  stmt.run(id);
};
