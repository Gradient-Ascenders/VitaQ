const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

const rootDir = path.join(__dirname, "..", "..");
const frontendDir = path.join(rootDir, "frontend");

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function sendFile(res, filePath, statusCode = 200) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || "application/octet-stream";

    res.writeHead(statusCode, { "Content-Type": contentType });
    res.end(data);
  });
}

function getPageFile(reqPath) {
  if (reqPath === "/") {
    return path.join(frontendDir, "pages", "landing", "index.html");
  }

  if (reqPath === "/register") {
    return path.join(frontendDir, "pages", "register", "index.html");
  }

  if (reqPath === "/login") {
    return path.join(frontendDir, "pages", "login", "index.html");
  }

  if (reqPath === "/dashboard") {
    return path.join(frontendDir, "pages", "dashboard", "index.html");
  }

  if (reqPath === "/clinics") {
    return path.join(frontendDir, "pages", "clinics", "index.html");
  }

  if (reqPath.startsWith("/clinic/")) {
    return path.join(frontendDir, "pages", "clinic", "index.html");
  }

  if (reqPath === "/booking-confirmation") {
    return path.join(frontendDir, "pages", "booking-confirmation", "index.html");
  }

  if (reqPath === "/appointments") {
    return path.join(frontendDir, "pages", "appointments", "index.html");
  }

  return null;
}

const server = http.createServer((req, res) => {
  const reqPath = req.url.split("?")[0];

  if (reqPath.startsWith("/assets/")) {
    const assetPath = path.join(frontendDir, reqPath);

    if (!assetPath.startsWith(frontendDir)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }

    sendFile(res, assetPath);
    return;
  }

  if (reqPath.startsWith("/js/")) {
    const jsPath = path.join(frontendDir, reqPath);

    if (!jsPath.startsWith(frontendDir)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }

    sendFile(res, jsPath);
    return;
  }

  const pageFile = getPageFile(reqPath);

  if (pageFile) {
    sendFile(res, pageFile);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("404 Not Found");
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});