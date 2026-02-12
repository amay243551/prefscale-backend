/* eslint-disable */
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

/* ================= HEALTH ROUTE ================= */
app.get("/", (req, res) => {
  res.send("Prefscale Backend Running 🚀");
});

/* ================= CLOUDINARY ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= MONGODB ================= */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch((err) => console.error("Mongo error:", err));

/* ================= MODELS ================= */

const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      name: String,
      company: String,
      email: { type: String, unique: true },
      password: String,
      role: { type: String, default: "user" },
    },
    { timestamps: true }
  )
);

const Blog = mongoose.model(
  "Blog",
  new mongoose.Schema(
    {
      title: { type: String, required: true },
      description: { type: String, required: true },
      content: String,
      section: {
        type: String,
        enum: ["resources", "allblogs"],
      },
      fileUrl: String,
      publicId: String,
      uploadedBy: String,
    },
    { timestamps: true }
  )
);

/* ================= AUTH MIDDLEWARE ================= */

const adminOnly = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
      return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "admin")
      return res.status(403).json({ message: "Admin only" });

    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

/* ================= AUTH ROUTES ================= */

/* SIGNUP */
app.post("/api/signup", async (req, res) => {
  try {
    const { name, company, email, password } = req.body;

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name,
      company,
      email,
      password: hashed,
    });

    res.json({ message: "Signup successful" });
  } catch (err) {
    res.status(400).json({ message: "Email already exists" });
  }
});

/* LOGIN */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    /* ADMIN LOGIN */
    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = jwt.sign({ role: "admin" }, JWT_SECRET, {
        expiresIn: "1d",
      });

      return res.json({ token, role: "admin" });
    }

    /* USER LOGIN */
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { role: user.role, id: user._id },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token, role: user.role });
  } catch {
    res.status(500).json({ message: "Login failed" });
  }
});

/* ================= STORAGE ================= */

const resourceStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "prefscale/resources",
    resource_type: "raw",
    allowed_formats: ["pdf"],
  },
});

const uploadResource = multer({ storage: resourceStorage });

const blogImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "prefscale/blog-images",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const uploadImage = multer({ storage: blogImageStorage });

/* ================= BLOG ROUTES ================= */

/* Upload Resource (PDF) */
app.post(
  "/api/admin/upload-resource",
  adminOnly,
  uploadResource.single("file"),
  async (req, res) => {
    const { title, description } = req.body;

    const blog = await Blog.create({
      title,
      description,
      section: "resources",
      fileUrl: req.file.path,
      publicId: req.file.filename,
      uploadedBy: process.env.ADMIN_EMAIL,
    });

    res.json(blog);
  }
);

/* Upload AllBlog (Rich Text) */
app.post(
  "/api/admin/upload-allblog",
  adminOnly,
  async (req, res) => {
    const { title, description, content } = req.body;

    const blog = await Blog.create({
      title,
      description,
      content,
      section: "allblogs",
      uploadedBy: process.env.ADMIN_EMAIL,
    });

    res.json(blog);
  }
);

/* Upload Blog Image */
app.post(
  "/api/admin/upload-image",
  adminOnly,
  uploadImage.single("image"),
  (req, res) => {
    res.json({ url: req.file.path });
  }
);

/* Get Blogs */
app.get("/api/blogs", async (req, res) => {
  const { section } = req.query;

  let filter = {};
  if (section) {
    filter.$or = [
      { section: section },
      { section: { $exists: false } },
    ];
  }

  const blogs = await Blog.find(filter).sort({ createdAt: -1 });

  res.json(blogs);
});

/* Get Single Blog */
app.get("/api/blog/:id", async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  res.json(blog);
});

/* Delete Blog */
app.delete("/api/admin/blog/:id", adminOnly, async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog)
    return res.status(404).json({ message: "Not found" });

  if (blog.publicId) {
    await cloudinary.uploader.destroy(blog.publicId, {
      resource_type: "raw",
    });
  }

  await blog.deleteOne();
  res.json({ message: "Deleted successfully" });
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
