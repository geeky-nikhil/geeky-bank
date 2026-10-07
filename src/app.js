const express = require("express")
const cookieParser = require("cookie-parser")



const app = express()


app.use(express.json({ limit: "32kb" }))
app.use(cookieParser())
app.use((req, res, next) => { req.body ||= {}; next(); })

/**
 * - Routes required
 */
const authRouter = require("./routes/auth.routes")
const accountRouter = require("./routes/account.routes")
const transactionRoutes = require("./routes/transaction.routes")

/**
 * - Use Routes
 */

app.get("/", (req, res) => {
    res.send("Ledger Service is up and running")
})

app.use("/api/auth", authRouter)
app.use("/api/accounts", accountRouter)
app.use("/api/transactions", transactionRoutes)

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status || (err.code === 11000 ? 409 :
        ["ValidationError", "CastError"].includes(err.name) ? 400 : 500);
    res.status(status).json({ message: status >= 500 ? "Internal server error" :
        err.code === 11000 ? "Resource already exists" : err.message });
});
module.exports = app