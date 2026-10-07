const userModel = require("../models/user.model")
const jwt = require("jsonwebtoken")
const emailService = require("../services/email.service")
const tokenBlackListModel = require("../models/blackList.model")

/**
* - user register controller
* - POST /api/auth/register
*/
async function userRegisterController(req, res) {
    const { password, name } = req.body
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : ""
    if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password) > 72 || typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Valid name, email and 8-72 byte password required" })

    const isExists = await userModel.findOne({
        email: email
    })

    if (isExists) {
        return res.status(422).json({
            message: "User already exists with email.",
            status: "failed"
        })
    }

    const user = await userModel.create({
        email, password, name
    })

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" })

    res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 3 * 86400000 })

    res.status(201).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name
        },
        token
    })

    void emailService.sendRegistrationEmail(user.email, user.name).catch(() => console.error("Registration notification failed"))
}

/**
 * - User Login Controller
 * - POST /api/auth/login
  */

async function userLoginController(req, res) {
    const { password } = req.body
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : ""
    if (!email || typeof password !== "string" || Buffer.byteLength(password) > 72) return res.status(400).json({ message: "Invalid credentials" })

    const user = await userModel.findOne({ email }).select("+password")

    if (!user) {
        return res.status(401).json({
            message: "Email or password is INVALID"
        })
    }

    const isValidPassword = await user.comparePassword(password)

    if (!isValidPassword) {
        return res.status(401).json({
            message: "Email or password is INVALID"
        })
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "3d" })

    res.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", maxAge: 3 * 86400000 })

    res.status(200).json({
        user: {
            _id: user._id,
            email: user.email,
            name: user.name
        },
        token
    })

}


/**
 * - User Logout Controller
 * - POST /api/auth/logout
  */
async function userLogoutController(req, res) {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[ 1 ]

    if (!token) {
        return res.status(200).json({
            message: "User logged out successfully"
        })
    }



    await tokenBlackListModel.create({
        token: token
    })

    res.clearCookie("token")

    res.status(200).json({
        message: "User logged out successfully"
    })

}


module.exports = {
    userRegisterController,
    userLoginController,
    userLogoutController
}