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
  .catch((err) => console.error(err));

/* ================= MODELS ================= */
const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      name: String,
      company: String,
      email: { type: String, unique: true },
      password: String,
      role: { type: String, enum: ["user", "admin"], default: "user" },
    },
    { timestamps: true }
  )
);

const Blog = mongoose.model(
  "Blog",
  new mongoose.Schema(
    {
      title: String,
      description: String,
      category: {
        type: String,
        enum: ["foundations", "deep"],
        required: true,
      },
      fileUrl: String,
      publicId: String,
      uploadedBy: String,
    },
    { timestamps: true }
  )
);

/* ================= CONTACT MODEL  ================= */
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

/* ================= AUTH ================= */
const adminOnly = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
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

/* SIGNUP */
app.post("/api/signup", async (req, res) => {
  try {
    const { name, company, email, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    await User.create({ name, company, email, password: hashed });
    res.json({ message: "Signup successful" });
  } catch (err) {
    res.status(400).json({ message: "Email already exists" });
  }
});

/* LOGIN */
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  // ADMIN
  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign({ role: "admin" }, JWT_SECRET, {
      expiresIn: "1d",
    });
    return res.json({ token, role: "admin" });
  }

  // USER
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    { role: user.role, id: user._id },
    JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({ token, role: user.role });
});

/* ================= CONTACT ROUTE  ================= */
app.post("/api/contact", async (req, res) => {
  try {
    const { name, company, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    await Contact.create({ name, company, email, message });

    res.json({ message: "Message sent successfully ✅" });
  } catch (err) {
    console.error("Contact error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

/* UPLOAD BLOG (ADMIN) */
app.post(
  "/api/admin/blog",
  adminOnly,
  upload.single("file"),
  async (req, res) => {
    const { title, description, category } = req.body;

    if (!req.file || !category) {
      return res.status(400).json({ message: "File and category required" });
    }

    const blog = await Blog.create({
      title,
      description,
      category,
      fileUrl: req.file.path,
      publicId: req.file.filename,
      uploadedBy: "admin",
    });

    res.json(blog);
  }
);

/* DELETE BLOG (ADMIN) */
app.delete("/api/admin/blog/:id", adminOnly, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    if (blog.publicId) {
      await cloudinary.uploader.destroy(blog.publicId, {
        resource_type: "raw",
      });
    }

    await blog.deleteOne();
    res.json({ message: "Blog deleted successfully ✅" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

/* GET BLOGS */
app.get("/api/blogs", async (req, res) => {
  const filter = req.query.category ? { category: req.query.category } : {};
  const blogs = await Blog.find(filter).sort({ createdAt: -1 });
  res.json(blogs);
});

/* START */
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
