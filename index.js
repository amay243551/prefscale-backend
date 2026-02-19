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
const Groq = require("groq-sdk"); // ✅ ADDED

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

/* ================= AI SETUP ================= */ // ✅ ADDED

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/* ================= HEALTH ================= */

app.get("/", (req, res) => {
  res.send("Prefscale Backend Running 🚀");
});

/* ================= CLOUDINARY ================= */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ================= MONGO ================= */

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
        required: true,
      },

      // ✅ NEW FIELD (IMPORTANT)
      category: {
        type: String,
        enum: ["foundations", "deepdive"],
      },

      fileUrl: String,
      publicId: String,

      thumbnail: String,
      likes: { type: Number, default: 0 },

      uploadedBy: { type: String, required: true },
    },
    { timestamps: true }
  )
);


/* ================= CONTACT MODEL ================= */

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


/* ================= ADMIN MIDDLEWARE ================= */

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

/* ================= AUTH ================= */

app.post("/api/signup", async (req, res) => {
  try {
    const { name, company, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);

    await User.create({ name, company, email, password: hashed });

    res.json({ message: "Signup successful" });
  } catch {
    res.status(500).json({ message: "Signup failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = jwt.sign({ role: "admin" }, JWT_SECRET, {
        expiresIn: "1d",
      });

      return res.json({ token, role: "admin" });
    }

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

/* ================= CONTACT ROUTE ================= */

app.post("/api/contact", async (req, res) => {
  try {
    const { name, company, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Please fill all required fields" });
    }

    await Contact.create({ name, company, email, message });

    res.json({ message: "Message sent successfully ✅" });
  } catch (err) {
    console.error("Contact error:", err);
    res.status(500).json({ message: "Something went wrong" });
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

/* Upload Resource */
app.post(
  "/api/admin/upload-resource",
  adminOnly,
  uploadResource.single("file"),
  async (req, res) => {
    try {
      const { title, description, category } = req.body;

      const blog = await Blog.create({
        title,
        description,
        category, // ✅ SAVED NOW
        section: "resources",
        fileUrl: req.file.path,
        publicId: req.file.filename,
        uploadedBy: process.env.ADMIN_EMAIL,
      });

      res.json(blog);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

/* Upload Blog */
app.post(
  "/api/admin/upload-allblog",
  adminOnly,
  async (req, res) => {
    try {
      const { title, description, content, thumbnail } = req.body;

      const blog = await Blog.create({
        title,
        description,
        content,
        thumbnail,
        section: "allblogs",
        uploadedBy: process.env.ADMIN_EMAIL,
      });

      res.json(blog);
    } catch {
      res.status(500).json({ message: "Upload failed" });
    }
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

/* Like Blog */
app.post("/api/blog/:id/like", async (req, res) => {
  try {
    const blog = await Blog.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );

    if (!blog)
      return res.status(404).json({ message: "Not found" });

    res.json(blog);
  } catch {
    res.status(500).json({ message: "Like failed" });
  }
});

/* Get Blogs */
app.get("/api/blogs", async (req, res) => {
  try {
    const { section, category } = req.query;

    let filter = {};
    if (section) filter.section = section;
    if (category) filter.category = category;

    const blogs = await Blog.find(filter).sort({ createdAt: -1 });

    res.json(blogs);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
});

/* Get Single */
app.get("/api/blog/:id", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog)
      return res.status(404).json({ message: "Not found" });

    res.json(blog);
  } catch {
    res.status(500).json({ message: "Fetch failed" });
  }
});

/* Delete */
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
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
});



/* ================= AI ROUTE ================= */ // ✅ ADDED

app.post("/api/ai/ask", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    const completion = await groq.chat.completions.create({
      model: "llama3-8b-8192",
      messages: [
        {
          role: "system",
          content:
            "You are Prefscale AI assistant. Only answer about performance testing, load testing, QA tools and Prefscale services.",
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    res.json({
      reply: completion.choices[0]?.message?.content,
    });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ message: "AI failed" });
  }
});


/* ================= START ================= */

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
