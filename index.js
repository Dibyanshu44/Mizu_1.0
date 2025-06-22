import express from "express";
import bodyParser from "body-parser";
import pool from "./db.js";
import http from "http";
import { Server } from "socket.io";
import path from "path";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// var port = 3000;

const port = process.env.PORT || 3000;


app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// ROUTES

app.get("/", (req, res) => {
  res.render("index.ejs", { code: null, page: "Sign-up" });
});

app.post("/Sign-up", async (req, res) => {
  const user = req.body.user;
  const pass = req.body.pass;
  try {
    const check = await pool.query("SELECT * FROM users WHERE username=$1", [user]);
    if (check.rows.length > 0) {
      res.render("index.ejs", { code: "Username already taken", page: "Sign-up" });
    } else {
      await pool.query("INSERT INTO users(username, password) VALUES ($1, $2)", [user, pass]);
      res.redirect(`/home?user=${user}`);
    }
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Error fetching users");
  }
});

app.get("/login", (req, res) => {
  res.render("index.ejs", { code: null, page: "Log-in" });
});

app.post("/Log-in", async (req, res) => {
  const user = req.body.user;
  const pass = req.body.pass;
  const usercheck = await pool.query("SELECT * FROM users WHERE username=$1", [user]);
  if (usercheck.rows.length === 0) {
    res.render("index.ejs", { code: "Username not found!", page: "Log-in" });
  } else {
    const passcheck = await pool.query("SELECT password FROM users WHERE username=$1", [user]);
    if (pass === passcheck.rows[0].password) {
      res.redirect(`/home?user=${user}`);
    } else {
      res.render("index.ejs", { code: "Incorrect Password", page: "Log-in" });
    }
  }
});

app.get("/home", async (req, res) => {
  const user = req.query.user;
  const posts = await pool.query("SELECT * FROM posts ORDER BY created_at DESC");
  const allUsers = await pool.query("SELECT username FROM users WHERE username != $1", [user]);
  res.render("home.ejs", { user, posts: posts.rows, allUsers: allUsers.rows, page: "Home" });
});

app.post("/post", async (req, res) => {
  const content = req.body.content;
  const user = req.body.user;
  await pool.query("INSERT INTO posts(username, content) VALUES ($1, $2)", [user, content]);
  res.redirect(`/home?user=${user}`);
});

app.get("/chat", async (req, res) => {
  const { user, with: withUser } = req.query;
  const messages = await pool.query(
    "SELECT * FROM messages WHERE (sender=$1 AND receiver=$2) OR (sender=$2 AND receiver=$1) ORDER BY sent_at ASC",
    [user, withUser]
  );
  res.render("chats.ejs", {
    user,
    withUser,
    messages: messages.rows,
    page: "Chat"
  });
});

app.post("/chat", async (req, res) => {
  const { sender, receiver, content } = req.body;
  await pool.query(
    "INSERT INTO messages(sender, receiver, content) VALUES ($1, $2, $3)",
    [sender, receiver, content]
  );
  res.redirect(`/chat?user=${sender}&with=${receiver}`);
});

app.get("/chat-users", async (req, res) => {
  const user = req.query.user;
  const allUsers = await pool.query("SELECT username FROM users WHERE username != $1", [user]);
  res.render("chat-users.ejs", { user, allUsers: allUsers.rows, page: "ChatUsers" });
});

// SOCKET.IO
io.on("connection", (socket) => {
  socket.on("joinRoom", ({ sender, receiver }) => {
    const room = [sender, receiver].sort().join("-");
    socket.join(room);
  });

  socket.on("sendMessage", async ({ sender, receiver, content }) => {
    const room = [sender, receiver].sort().join("-");
    await pool.query("INSERT INTO messages(sender, receiver, content) VALUES ($1, $2, $3)", [sender, receiver, content]);
    io.to(room).emit("newMessage", { sender, content, sent_at: new Date() });
  });
});

server.listen(port, () => {
  console.log("Server running on port", port);
});
