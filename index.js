import express from "express";
import bodyParser from "body-parser";
import pool from "./db.js";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import multer from "multer";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// var port = 3000;

const port = process.env.PORT || 3000;


app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

const upload=multer({storage:multer.memoryStorage()});

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
  const likes=await pool.query("select id from likes where username=$1", [user]);
  const count = await pool.query("SELECT id, COUNT(*) AS total FROM likes GROUP BY id");
  const allLikes = await pool.query("SELECT id, username FROM likes");
  res.render("home.ejs", { user, posts: posts.rows, allUsers: allUsers.rows, page: "Home" ,likes:likes.rows,count:count.rows,allLikes: allLikes.rows});
});

app.post("/post", upload.single("image"), async (req, res) => {
  const content = req.body.content;
  const user = req.body.user;

  if (req.file) {
    const image = req.file.buffer;
    const mimetype = req.file.mimetype;

    await pool.query(
      "INSERT INTO posts(username, content, file, mimetype) VALUES ($1, $2, $3, $4)",
      [user, content, image, mimetype]
    );
  } else {
    await pool.query(
      "INSERT INTO posts(username, content) VALUES ($1, $2)",
      [user, content]
    );
  }

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

app.get("/files/:id",async(req,res)=>{
  const attachment=await pool.query("select file,mimetype from posts where id=$1",[req.params.id]);
  const post=attachment.rows[0];
  res.set("Content-type",post.mimetype);
  res.send(post.file);
});

app.get("/comments/:id",async(req,res)=>{
  const attachment=await pool.query("select file,mimetype from comments where id=$1",[req.params.id]);
  const post=attachment.rows[0];
  res.set("Content-type",post.mimetype);
  res.send(post.file);
});

app.get("/chats/:id",async(req,res)=>{
  const attachment=await pool.query("select file,mimetype from messages where id=$1",[req.params.id]);
  const post=attachment.rows[0];
  res.set("Content-type",post.mimetype);
  res.send(post.file);
});

app.post("/chat", async (req, res) => {
  const { sender, receiver, content } = req.body;
  await pool.query(
    "INSERT INTO messages(sender, receiver, content, file, mimetype) VALUES ($1, $2, $3, $4, $5)",
    [sender, receiver, content, req.file.buffer, req.file.mimetype]
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

  socket.on("sendMessage", async ({ sender, receiver, content, image, mimetype }) => {
  const room = [sender, receiver].sort().join("-");

  let result;
  if (image) {
    const buffer = Buffer.from(image, 'base64');
    result = await pool.query(
      "INSERT INTO messages(sender, receiver, content, file, mimetype) VALUES ($1, $2, $3, $4, $5) RETURNING id, sent_at",
      [sender, receiver, content || "", buffer, mimetype]
    );
  } else {
    result = await pool.query(
      "INSERT INTO messages(sender, receiver, content) VALUES ($1, $2, $3) RETURNING id, sent_at",
      [sender, receiver, content]
    );
  }

  const message = {
    sender,
    content,
    sent_at: result.rows[0].sent_at,
    id: result.rows[0].id,
    hasImage: !!image
  };

  io.to(room).emit("newMessage", message);
});

});

app.post("/logout", (req, res) => {
  res.redirect("/");
});

app.post("/like",async(req,res)=>{
  const user=req.body.user;
  const postid=req.body.id;
  await pool.query("insert into likes values ($1,$2)",[postid,user]);
  res.redirect(`/home?user=${user}`);
});

app.post("/dislike",async(req,res)=>{
  const user=req.body.user;
  const postid=req.body.id;
  await pool.query("DELETE FROM likes WHERE id = $1 AND username = $2", [postid, user]);
  res.redirect(`/home?user=${user}`);
});

app.post("/comment",async(req,res)=>{
  const result = await pool.query("SELECT * FROM comments WHERE postid = $1 ORDER BY id desc", [req.body.postid]);
  const comments = result.rows;
  const postid=req.body.postid;
  const uploader=req.body.uploader;
  const self=req.body.self;
  const caption=req.body.caption;
  const postResult = await pool.query("SELECT file FROM posts WHERE id = $1", [postid]);
  const hasImage = postResult.rows.length > 0 && postResult.rows[0].file;
  res.render("comments.ejs",{postid:postid,uploader:uploader,page:"comments",user:self,comments:comments,caption:caption,hasImage});
});

app.post("/comment-post", upload.single("image"), async (req, res) => {
  const content = req.body.content;
  const user = req.body.user;
  const postid=req.body.postid;

  if (req.file) {
    const image = req.file.buffer;
    const mimetype = req.file.mimetype;

    await pool.query(
      "INSERT INTO comments(username, content, file, mimetype, postid) VALUES ($1, $2, $3, $4, $5)",
      [user, content, image, mimetype, postid]
    );
  } else {
    await pool.query(
      "INSERT INTO comments(username, content, postid) VALUES ($1, $2, $3)",
      [user, content, postid]
    );
  }
  const result = await pool.query("SELECT * FROM comments WHERE postid = $1 ORDER BY id desc", [req.body.postid]);
  const comments = result.rows;
  const uploader=req.body.uploader;
  const postResult = await pool.query("SELECT file FROM posts WHERE id = $1", [postid]);
  const hasImage = postResult.rows.length > 0 && postResult.rows[0].file;
  const caption=req.body.caption;
  res.render("comments.ejs",{postid:postid,uploader:uploader,page:"comments",user:user,comments:comments,hasImage,caption});
});

app.get("/view-image/:type/:id", async (req, res) => {
  var { type, id } = req.params;

  let imageQuery;
  if (type === "post") {
    imageQuery = "SELECT file, mimetype, content FROM posts WHERE id = $1";
    type="file";
  } else if (type === "comment") {
    imageQuery = "SELECT file, mimetype, content FROM comments WHERE id = $1";
  }
  else if (type === "chat") {
    imageQuery = "SELECT file, mimetype, content FROM messages WHERE id = $1";
  }
  else {
    return res.status(400).send("Invalid image type.");
  }

  try {
    const result = await pool.query(imageQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).send("Image not found.");
    }

    const imageBuffer = result.rows[0].file;
    const mimetype = result.rows[0].mimetype;
    const caption = result.rows[0].content;

    // Render full-screen image viewer
    res.render("image-viewer.ejs", {
      id,
      type,
      mimetype,
      page: "image",
      caption,
    });
  } catch (err) {
    console.error("Error fetching image:", err);
    res.status(500).send("Server error.");
  }
});


server.listen(port, () => {
  console.log("Server running on port", port);
});
