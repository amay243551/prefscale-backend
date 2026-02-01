/* eslint-disable */
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const multer = require("multer");
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
app.use("/uploads", express.static("uploads"));

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

/* ================= MONGODB ================= */
mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
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

/* ================= BLOG SCHEMA (FIXED) ================= */
const blogSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    pdf: String, // ✅ single field for file
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

/* ================= CONTACT ================= */
const contactSchema = new mongoose.Schema(
  {
    name: String,
    company: String,
    email: String,
    message: String,
  },
  { timestamps: true }
);
const Contact = mongoose.model("Contact", contactSchema);

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
    if (exists) {
      return res.status(400).json({ message: "User exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      company,
      email,
      password: hashed,
      role: "user",
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

    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = jwt.sign({ role: "admin", email }, JWT_SECRET, {
        expiresIn: "1d",
      });

      return res.json({ token, role: "admin", name: "Admin" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
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

    if (decoded.role !== "admin")
      return res.status(403).json({ message: "Admin only" });

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

/* ================= FILE UPLOAD ================= */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only PDF or Word files allowed"));
    }
    cb(null, true);
  },
});

/* ================= ADMIN BLOG UPLOAD (FIXED) ================= */
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

      const blog = await Blog.create({
        title,
        description,
        category, // ✅ VERY IMPORTANT
        pdf: req.file.filename,
        uploadedBy: "admin",
      });

      res.json({ message: "Blog uploaded successfully ✅", blog });
    } catch (err) {
      console.error("Blog upload error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ================= GET BLOGS BY CATEGORY ================= */
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
