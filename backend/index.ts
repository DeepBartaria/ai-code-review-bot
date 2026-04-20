import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import axios from 'axios';
import { createSession, saveReview, getSessions, getSessionById, deleteSession } from './db';
import { WSMessageFromClient, WSMessageFromServer, ReviewSchema } from './types';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

app.get('/sessions', (req, res) => {
  res.json(getSessions());
});

app.get('/sessions/:id', (req, res) => {
  const session = getSessionById(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(session);
});

app.delete('/sessions/:id', (req, res) => {
  deleteSession(req.params.id);
  res.json({ success: true });
});

const sendWsMsg = (ws: WebSocket, msg: WSMessageFromServer) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
};

wss.on('connection', (ws: WebSocket) => {
  const sessionId = uuidv4();
  sendWsMsg(ws, { type: 'connected', sessionId });

  ws.on('message', async (message: Buffer | string) => {
    try {
      const parsedData = JSON.parse(message.toString());
      if (parsedData.type === 'review_request') {
        const data = parsedData as Extract<WSMessageFromClient, { type: 'review_request' }>;
        createSession(sessionId, data.language, data.code);
        
        let fullReview = "";
        
        try {
          const response = await axios({
            method: 'post',
            url: `${PYTHON_SERVICE_URL}/review`,
            data: { code: data.code, language: data.language },
            responseType: 'stream'
          });

          let buffer = "";
          response.data.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; 

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                 const payload = line.replace('data: ', '').trim();
                 if (payload === '[DONE]') continue;
                 try {
                   const token = JSON.parse(payload);
                   
                   // if the python service sent an error dictionary
                   if (typeof token === 'object' && token !== null && 'error' in token) {
                       sendWsMsg(ws, { type: 'error', message: String(token.error) });
                       return;
                   }

                   sendWsMsg(ws, { type: 'chunk', data: token });
                   fullReview += token; 
                 } catch (e: unknown) {
                   fullReview += payload;
                   sendWsMsg(ws, { type: 'chunk', data: payload });
                 }
              }
            }
          });

          response.data.on('end', () => {
            if (buffer.startsWith('data: ')) {
              const payload = buffer.replace('data: ', '').trim();
              if (payload !== '[DONE]') {
                try { fullReview += JSON.parse(payload); } catch (e: unknown) {}
              }
            }

            let parsedReview: ReviewSchema;
            try {
               let cleanedReview = fullReview.trim();
               if (cleanedReview.startsWith('```json')) {
                   cleanedReview = cleanedReview.replace(/^```json/, '').replace(/```$/, '').trim();
               }
               parsedReview = JSON.parse(cleanedReview) as ReviewSchema;
               saveReview(sessionId, parsedReview);
               sendWsMsg(ws, { type: 'complete', review: parsedReview });
            } catch (e: unknown) {
               console.error("Failed to parse full review as JSON", fullReview);
               sendWsMsg(ws, { type: 'error', message: "Failed to parse JSON. Please try again." });
            }
          });
          
          response.data.on('error', (err: unknown) => {
              console.error(err);
              sendWsMsg(ws, { type: 'error', message: 'Failed to stream from AI service' });
          });
        } catch (err: unknown) {
           const errMsg = err instanceof Error ? err.message : 'Unknown AI HTTP Error';
           console.error("AI Service Request Failed", errMsg);
           sendWsMsg(ws, { type: 'error', message: 'AI Service is unreachable or returned an error.' });
        }
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Unknown Error parsing WS message';
      console.error(e);
      sendWsMsg(ws, { type: 'error', message: errMsg });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Node backend listening on port ${PORT}`);
});
