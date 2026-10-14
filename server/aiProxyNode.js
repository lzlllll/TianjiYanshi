/**
 * 把 Node 的 http 请求/响应接到 AI 转发上。
 * serve-local（游戏内嵌服务）与 server/index.js（额度后端）共用这一份，免得各写各的。
 */

import { Readable } from "node:stream";
import { handleAiChat } from "./aiProxy.js";

export async function serveAiChatNode(req, res, env = process.env) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  const request = new Request("http://localhost/api/ai/chat/completions", {
    method: req.method,
    headers: {
      "content-type": req.headers["content-type"] || "application/json",
      accept: req.headers["accept"] || "application/json",
    },
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });

  const response = await handleAiChat(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));

  if (response.body) {
    Readable.fromWeb(response.body).pipe(res);
  } else {
    res.end();
  }
}
