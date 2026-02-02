/* eslint-disable */
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
require("dotenv").config();

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
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
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
  })
  .then(() => console.log("MongoDB connected ✅"))
  .catch((err) => console.error("Mongo error ❌", err));

/* ================= USER SCHEMA ================= */
const userSchema = new mongoose.Schema(
  {
    name: String,
    company: String,
    email: { type: String, unique: true },
    password: String,
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
  },
  { timestamps: true }
);
const User = mongoose.model("User", userSchema);

/* ================= BLOG SCHEMA ================= */
const blogSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    fileUrl: String, // ✅ CLOUDINARY URL
    category: {
      type: String,
      enum: ["foundations", "deep"],
      required: true,
    },
    uploadedBy: String,
  },
  { timestamps: true }
);
const Blog = mongoose.model("Blog", blogSchema);

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.send("Prefscale Backend Live 🚀");
});

/* ================= SIGNUP ================= */
app.post("/api/signup", async (req, res) => {
  try {
    const { name, company, email, password } = req.body;

    if (!name || !company || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "User exists" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      company,
      email,
      password: hashed,
    });

    res.json({ message: "Signup successful", role: user.role });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= LOGIN ================= */
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

      return res.json({ token, role: "admin", name: "Admin" });
    }

    /* USER LOGIN */
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token, role: user.role, name: user.name });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= ADMIN AUTH ================= */
const adminOnly = (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: "No token" });

    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

/* ================= MULTER (MEMORY) ================= */
const upload = multer({ storage: multer.memoryStorage() });

/* ================= ADMIN BLOG UPLOAD ================= */
app.post(
  "/api/admin/blog",
  adminOnly,
  upload.single("file"),
  async (req, res) => {
    try {
      const { title, description, category } = req.body;

      if (!req.file || !category) {
        return res
          .status(400)
          .json({ message: "File and category required" });
      }

      /* UPLOAD TO CLOUDINARY */
      const result = await cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          folder: "prefscale_blogs",
        },
        async (error, uploadResult) => {
          if (error) {
            console.error(error);
            return res.status(500).json({ message: "Upload failed" });
          }

          const blog = await Blog.create({
            title,
            description,
            category,
            fileUrl: uploadResult.secure_url,
            uploadedBy: "admin",
          });

          res.json({
            message: "Blog uploaded successfully ✅",
            blog,
          });
        }
      );

      result.end(req.file.buffer);
    } catch (err) {
      console.error("Blog upload error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ================= GET BLOGS ================= */
app.get("/api/blogs", async (req, res) => {
  try {
    const { category } = req.query;
    const filter = category ? { category } : {};

    const blogs = await Blog.find(filter).sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    console.error("Fetch blogs error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
