/* eslint-disable */
const express = require("express");
const cors = require("cors");
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

/* ================= BLOG MODEL ================= */

const Blog = mongoose.model(
  "Blog",
  new mongoose.Schema(
    {
      title: { type: String, required: true },
      description: { type: String, required: true },

      // Rich HTML content (for AllBlogs)
      content: { type: String },

      section: {
        type: String,
        enum: ["resources", "allblogs"],
      },

      // Only for resources (PDF system)
      fileUrl: String,
      publicId: String,

      uploadedBy: { type: String, required: true },
    },
    { timestamps: true }
  )
);

/* ================= AUTH ================= */

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

/* ================= STORAGE CONFIG ================= */

/* PDF STORAGE (Resources) */
const resourceStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "prefscale/resources",
    resource_type: "raw",
    allowed_formats: ["pdf"],
  },
});

const uploadResource = multer({ storage: resourceStorage });

/* BLOG IMAGE STORAGE (Rich Content Images) */
const blogImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "prefscale/blog-images",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const uploadImage = multer({ storage: blogImageStorage });

/* ================= ROUTES ================= */

/* ================= UPLOAD RESOURCE (PDF) ================= */
app.post(
  "/api/admin/upload-resource",
  adminOnly,
  uploadResource.single("file"),
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
      console.error("Resource upload error:", err);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

/* ================= UPLOAD ALLBLOG (Rich Text) ================= */
app.post(
  "/api/admin/upload-allblog",
  adminOnly,
  async (req, res) => {
    try {
      const { title, description, content } = req.body;

      if (!title || !description || !content)
        return res
          .status(400)
          .json({ message: "Title, description & content required" });

      const blog = await Blog.create({
        title,
        description,
        content,
        section: "allblogs",
        uploadedBy: process.env.ADMIN_EMAIL || "Admin",
      });

      res.json(blog);
    } catch (err) {
      console.error("AllBlog upload error:", err);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

/* ================= IMAGE UPLOAD FOR EDITOR ================= */
app.post(
  "/api/admin/upload-image",
  adminOnly,
  uploadImage.single("image"),
  (req, res) => {
    res.json({ url: req.file.path });
  }
);

/* ================= GET BLOGS ================= */
app.get("/api/blogs", async (req, res) => {
  try {
    const { section } = req.query;

    let filter = {};

    if (section) {
      filter.$or = [
        { section: section },
        { section: { $exists: false } }, // include old blogs
      ];
    }

    const blogs = await Blog.find(filter).sort({
      createdAt: -1,
    });

    res.json(blogs);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ message: "Failed to fetch blogs" });
  }
});

/* ================= GET SINGLE BLOG ================= */
app.get("/api/blog/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog)
      return res.status(404).json({ message: "Blog not found" });

    res.json(blog);
  } catch (err) {
    res.status(500).json({ message: "Error fetching blog" });
  }
});

/* ================= DELETE BLOG ================= */
app.delete("/api/admin/blog/:id", adminOnly, async (req, res) => {
  try {
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
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

/* ================= START SERVER ================= */
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
