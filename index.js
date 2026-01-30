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
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch((err) => console.error("Mongo error ❌", err));

/* ================= USER SCHEMA ================= */
const userSchema = new mongoose.Schema(
  {
    name: String,
    company: String,
    email: { type: String, unique: true },
    password: String,
  },
  { timestamps: true }
);
const User = mongoose.model("User", userSchema);

/* ================= BLOG SCHEMA ================= */
const blogSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    pdf: String,
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

/* ================= SIGNUP (USER ONLY) ================= */
app.post("/api/signup", async (req, res) => {
  const { name, company, email, password } = req.body;

  if (!name || !company || !email || !password)
    return res.status(400).json({ message: "All fields required" });

  const exists = await User.findOne({ email });
  if (exists) return res.status(400).json({ message: "User exists" });

  const hashed = await bcrypt.hash(password, 10);

  await User.create({
    name,
    company,
    email,
    password: hashed,
  });

  res.json({ message: "Signup successful" });
});

/* ================= LOGIN (ADMIN + USER) ================= */
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  /* ===== ADMIN LOGIN ===== */
  if (
    email === process.env.ADMIN_EMAIL &&
    password === process.env.ADMIN_PASSWORD
  ) {
    const token = jwt.sign(
      { role: "admin", email },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      token,
      role: "admin",
      name: "Admin",
    });
  }

  /* ===== USER LOGIN ===== */
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { id: user._id, role: "user" },
    JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({
    token,
    role: "user",
    name: user.name,
  });
});

/* ================= CONTACT ================= */
app.post("/api/contact", async (req, res) => {
  await Contact.create(req.body);
  res.json({ message: "Message sent ✅" });
});

/* ================= ADMIN MIDDLEWARE ================= */
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
    return res.status(401).json({ message: "Invalid token" });
  }
};

/* ================= FILE UPLOAD ================= */
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

/* ================= ADMIN BLOG UPLOAD ================= */
app.post(
  "/api/admin/blog",
  adminOnly,
  upload.single("pdf"),
  async (req, res) => {
    const { title, description } = req.body;

    if (!req.file)
      return res.status(400).json({ message: "PDF required" });

    await Blog.create({
      title,
      description,
      pdf: req.file.filename,
      uploadedBy: "admin",
    });

    res.json({ message: "Blog uploaded successfully ✅" });
  }
);

/* ================= GET BLOGS (PUBLIC) ================= */
app.get("/api/blogs", async (req, res) => {
  const blogs = await Blog.find().sort({ createdAt: -1 });
  res.json(blogs);
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
