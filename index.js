/* eslint-disable */
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(
  cors({
    origin: "*", // allow Netlify + browser access
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

/* ================= MONGODB CONNECTION ================= */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Atlas connected ✅"))
  .catch((err) => console.error("MongoDB connection error ❌", err));

/* ================= USER SCHEMA ================= */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    company: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

/* ================= CONTACT SCHEMA ================= */
const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    company: String,
    email: { type: String, required: true },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

const Contact = mongoose.model("Contact", contactSchema);

/* ================= ROOT ROUTE ================= */
app.get("/", (req, res) => {
  res.send("Prefscale Backend is Live 🚀");
});

/* ================= TEST ROUTE ================= */
app.get("/test", (req, res) => {
  res.json({ message: "Backend + MongoDB working 🚀" });
});

/* ================= SIGNUP ================= */
app.post("/api/signup", async (req, res) => {
  try {
    const { name, company, email, password } = req.body;

    if (!name || !company || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name,
      company,
      email,
      password: hashedPassword,
    });

    res.status(201).json({ message: "Signup successful" });
  } catch (err) {
    console.error("Signup error ❌", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= LOGIN ================= */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({ message: "JWT secret not configured" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        name: user.name,
        company: user.company,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error ❌", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= CONTACT ================= */
app.post("/api/contact", async (req, res) => {
  try {
    const { name, company, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    await Contact.create({ name, company, email, message });

    res.json({ message: "Message sent successfully ✅" });
  } catch (err) {
    console.error("Contact error ❌", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= START SERVER ================= */
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
