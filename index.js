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

/* ================= CLOUDINARY CONFIG ================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= MONGODB CONNECTION ================= */
mongoose
  .connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("MongoDB connected ✅"))
  .catch((err) => console.error("Mongo error:", err));

/* ================= MODELS ================= */

const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      name: String,
      company: String,
      email: { type: String, unique: true, index: true },
      password: String,
      role: { type: String, enum: ["user", "admin"], default: "user" },
    },
    { timestamps: true }
  )
);

/* BLOG MODEL */
const Blog = mongoose.model(
  "Blog",
  new mongoose.Schema(
    {
      title: { type: String, required: true },
      description: { type: String, required: true },

      category: {
        type: String,
        enum: ["foundations", "deep"],
      },

      // NEW FIELD (for Resources & AllBlogs separation)
      section: {
        type: String,
        enum: ["resources", "allblogs"],
        default: "resources", // fallback for safety
      },

      fileUrl: String,
      publicId: String,
      uploadedBy: String,
    },
    { timestamps: true }
  )
);

const Contact = mongoose.model(
  "Contact",
  new mongoose.Schema(
    {
      name: { type: String, required: true },
      company: String,
      email: { type: String, required: true },
      message: { type: String, required: true },
    },
    { timestamps: true }
  )
);

/* ================= AUTH MIDDLEWARE ================= */
const adminOnly = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

/* ================= FILE UPLOAD ================= */
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "prefscale/blogs",
    resource_type: "raw",
    allowed_formats: ["pdf", "doc", "docx"],
  },
});

const upload = multer({ storage });

/* ================= ROUTES ================= */

app.get("/", (_, res) => {
  res.send("Prefscale Backend Live 🚀");
});

/* ================= SIGNUP ================= */
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
  } catch {
    res.status(400).json({ message: "Email already exists" });
  }
});

/* ================= LOGIN ================= */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Missing credentials" });

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
    const user = await User.findOne({ email }).lean();
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
  } catch (err) {
    console.error("Login error:", err);
    res.status(503).json({ message: "Server busy, retry later" });
  }
});

/* ================= CONTACT ================= */
app.post("/api/contact", async (req, res) => {
  try {
    const { name, company, email, message } = req.body;

    if (!name || !email || !message)
      return res.status(400).json({ message: "Required fields missing" });

    await Contact.create({ name, company, email, message });

    res.json({ message: "Message sent successfully ✅" });
  } catch {
    res.status(500).json({ message: "Failed to send message" });
  }
});

/* ================= ADMIN BLOG UPLOAD ================= */
app.post(
  "/api/admin/blog",
  adminOnly,
  upload.single("file"),
  async (req, res) => {
    try {
      const { title, description, category, section } = req.body;

      if (!title || !description || !req.file)
        return res.status(400).json({
          message: "Title, description and file are required",
        });

      const blog = await Blog.create({
        title,
        description,
        category,
        section: section || "resources",
        fileUrl: req.file.path,
        publicId: req.file.filename,
        uploadedBy: process.env.ADMIN_EMAIL || "Admin",
      });

      res.json(blog);
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

/* ================= DELETE BLOG ================= */
app.delete("/api/admin/blog/:id", adminOnly, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog)
      return res.status(404).json({ message: "Blog not found" });

    if (blog.publicId) {
      await cloudinary.uploader.destroy(blog.publicId, {
        resource_type: "raw",
      });
    }

    await blog.deleteOne();

    res.json({ message: "Blog deleted successfully ✅" });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
});

/* ================= GET BLOGS ================= */
app.get("/api/blogs", async (req, res) => {
  try {
    const { section, category } = req.query;

    const filter = {};

    // SECTION FILTER (supports old blogs too)
    if (section) {
      filter.$or = [
        { section: section },
        { section: { $exists: false } },
      ];
    }

    if (category) filter.category = category;

    const blogs = await Blog.find(filter).sort({ createdAt: -1 });

    res.json(blogs);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ message: "Failed to fetch blogs" });
  }
});

/* ================= START SERVER ================= */
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
