import { useState, useEffect } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { Play, Code2, History, Trash2, Activity, Zap, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import axios from 'axios';
import { ReviewSchema, Session, WSMessageFromClient } from './types/ws';
import { useWebSocket } from './hooks/useWebSocket';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';

function App() {
  const [code, setCode] = useState('// Paste your code here\nfunction example() {\n  console.log("Hello World");\n}\n');
  const [language, setLanguage] = useState('javascript');
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [rawChunk, setRawChunk] = useState<string>("");
  const [review, setReview] = useState<ReviewSchema | { error: string } | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await axios.get<Session[]>(`${API_URL}/sessions`);
      setSessions(res.data);
    } catch (e: unknown) {
      console.error('Failed to fetch sessions', e);
    }
  };

  const getExtensions = () => {
    switch (language) {
      case 'python': return [python()];
      case 'java': return [java()];
      case 'cpp': return [cpp()];
      default: return [javascript({ jsx: true, typescript: true })];
    }
  };

  const ws = useWebSocket({
    url: WS_URL,
    onChunk: (chunk: string) => {
      setRawChunk(prev => prev + chunk);
    },
    onComplete: (completedReview: ReviewSchema) => {
      setReview(completedReview);
      setIsReviewing(false);
      fetchSessions();
    },
    onError: (errorMessage: string) => {
      setReview({ error: errorMessage });
      setIsReviewing(false);
    }
  });

  const startReview = () => {
    if (!code.trim()) return;
    setIsReviewing(true);
    setReview(null);
    setRawChunk("");

    const reqData: WSMessageFromClient = {
      type: 'review_request',
      code,
      language
    };

    ws.connect(JSON.stringify(reqData));
  };

  const loadSession = async (id: string) => {
    try {
      const res = await axios.get<Session>(`${API_URL}/sessions/${id}`);
      const data = res.data;
      if (data) {
        setCode(data.code);
        setLanguage(data.language);
        setReview(data.review ?? null);
        setRawChunk(JSON.stringify(data.review, null, 2));
      }
    } catch (e: unknown) {
      console.error(e);
    }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API_URL}/sessions/${id}`);
      fetchSessions();
    } catch (err: unknown) {
      console.error(err);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar - History */}
      <div className="sidebar">
        <div className="sidebar-header">
          <History size={20} className="text-accent" />
          <span>Review History</span>
        </div>
        <div className="sidebar-content">
          {sessions.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', marginTop: '20px' }}>
              No past reviews.
            </div>
          ) : (
            sessions.map(s => (
              <div key={s.id} className="history-item" onClick={() => loadSession(s.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="history-title">{new Date(s.timestamp).toLocaleString()}</span>
                  <Trash2 size={16} style={{ color: 'var(--text-secondary)' }} onClick={(e) => deleteSession(s.id, e)} />
                </div>
                <div className="history-meta">
                   {s.language} • {s.code.substring(0, 30).replace(/\n/g, '')}...
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Split Pane */}
      <div className="main-content">
        {/* Top Navigation */}
        <div className="top-nav">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold' }}>
            <Zap size={24} style={{ color: 'var(--accent-color)' }} />
            AI Code Reviewer
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              style={{ background: 'var(--bg-color)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px' }}
            >
              <option value="javascript">JavaScript / TypeScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
            </select>

            <button className="btn" onClick={startReview} disabled={isReviewing || ws.isConnecting}>
              {isReviewing ? <Activity size={18} className="animate-spin" /> : <Play size={18} />}
              {isReviewing ? 'Reviewing...' : 'Review Code'}
            </button>
          </div>
        </div>

        <div className="workspace">
          {/* Left Pane - Editor */}
          <div className="pane pane-left">
            <div className="pane-header">
              <Code2 size={16} style={{ display: 'inline', marginRight: '6px' }} /> Editor
            </div>
            <div className="editor-container">
              <CodeMirror
                value={code}
                height="100%"
                theme="dark"
                extensions={getExtensions()}
                onChange={(value) => setCode(value)}
                style={{ height: '100%', fontSize: '14px' }}
              />
            </div>
          </div>

          {/* Right Pane - AI Feedback */}
          <div className="pane">
            <div className="pane-header">
              <Zap size={16} style={{ display: 'inline', marginRight: '6px' }} /> AI Processing
            </div>
            <div className="review-container">
              {isReviewing && !review && (
                <div className="reviewing-indicator" style={{ marginBottom: '20px' }}>
                  <Activity size={20} /> Streaming analysis...
                </div>
              )}

              {/* Once Complete, show structured output */}
              {review && !('error' in review) ? (
                <div className="structured-review">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                     <h2>Review Complete</h2>
                     <div className="score-badge">{review.score || '?'} / 100</div>
                  </div>
                  
                  <div className="review-card">
                    <div className="card-title"><CheckCircle2 size={18} /> Summary</div>
                    <p style={{ color: '#cbd5e1', lineHeight: '1.5' }}>{review.summary}</p>
                  </div>

                  {review.bugs && review.bugs.length > 0 && (
                    <div className="review-card">
                      <div className="card-title bugs"><AlertTriangle size={18} /> Bugs & Errors</div>
                      <ul>
                        {review.bugs.map((bug, i) => <li key={i} className="list-item">{bug}</li>)}
                      </ul>
                    </div>
                  )}

                  {review.security && review.security.length > 0 && (
                    <div className="review-card">
                      <div className="card-title security"><ShieldAlert size={18} /> Security Concerns</div>
                      <ul>
                        {review.security.map((sec, i) => <li key={i} className="list-item">{sec}</li>)}
                      </ul>
                    </div>
                  )}

                  {review.style && review.style.length > 0 && (
                    <div className="review-card">
                      <div className="card-title style"><Code2 size={18} /> Style & Suggestions</div>
                      <ul>
                        {review.style.map((sty, i) => <li key={i} className="list-item">{sty}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : review && 'error' in review ? (
                 <div className="review-card" style={{ borderLeft: '4px solid var(--error)' }}>
                    <div className="card-title bugs">Error Processing Review</div>
                    <p>{review.error}</p>
                 </div>
              ) : rawChunk && isReviewing ? (
                 <div className="raw-chunk-display">{rawChunk}</div>
              ) : !rawChunk && !review ? (
                 <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '40px' }}>
                    Send a code snippet to begin...
                 </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
