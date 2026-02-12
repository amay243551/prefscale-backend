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

const Blog = mongoose.model(
  "Blog",
  new mongoose.Schema(
    {
      title: { type: String, required: true },
      description: { type: String, required: true },
      section: {
        type: String,
        enum: ["resources", "allblogs"],
        required: true,
      },
      fileUrl: { type: String, required: true },
      publicId: { type: String, required: true },
      uploadedBy: { type: String, required: true },
    },
    { timestamps: true }
  )
);

/* ================= AUTH ================= */
const adminOnly = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "admin")
      return res.status(403).json({ message: "Admin only" });

    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

/* ================= DYNAMIC STORAGE ================= */

const createStorage = (folderName) =>
  new CloudinaryStorage({
    cloudinary,
    params: {
      folder: folderName,
      resource_type: "raw",
      allowed_formats: ["pdf"],
    },
  });

/* ================= RESOURCE UPLOAD ================= */
app.post(
  "/api/admin/upload-resource",
  adminOnly,
  multer({ storage: createStorage("prefscale/resources") }).single("file"),
  async (req, res) => {
    try {
      const { title, description } = req.body;

      const blog = await Blog.create({
        title,
        description,
        section: "resources",
        fileUrl: req.file.path,
        publicId: req.file.filename,
        uploadedBy: process.env.ADMIN_EMAIL || "Admin",
      });

      res.json(blog);
    } catch (err) {
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

/* ================= ALLBLOG UPLOAD ================= */
app.post(
  "/api/admin/upload-allblog",
  adminOnly,
  multer({ storage: createStorage("prefscale/allblogs") }).single("file"),
  async (req, res) => {
    try {
      const { title, description } = req.body;

      const blog = await Blog.create({
        title,
        description,
        section: "allblogs",
        fileUrl: req.file.path,
        publicId: req.file.filename,
        uploadedBy: process.env.ADMIN_EMAIL || "Admin",
      });

      res.json(blog);
    } catch (err) {
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

/* ================= GET BLOGS ================= */
app.get("/api/blogs", async (req, res) => {
  const { section } = req.query;
  const blogs = await Blog.find({ section }).sort({ createdAt: -1 });
  res.json(blogs);
});

/* ================= DELETE ================= */
app.delete("/api/admin/blog/:id", adminOnly, async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) return res.status(404).json({ message: "Not found" });

  await cloudinary.uploader.destroy(blog.publicId, {
    resource_type: "raw",
  });

  await blog.deleteOne();
  res.json({ message: "Deleted successfully" });
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
