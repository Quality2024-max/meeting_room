import "dotenv/config";
import jwt from "jsonwebtoken";

export const signToken = (user) => {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    }
  );
}

export const readUser = (token) => {
    try{
        return jwt.verify(token, process.env.JWT_SECRET);
    }catch(error){
        return null;
    }
}



// export const attachUser = (req, res, next) => {
//     try {
//         const token = req.cookies?.token;

//         if (token) {
//             req.user = jwt.verify(token, process.env.JWT_SECRET);
//         } else {
//             req.user = null;
//         }

//         res.locals.user = req.user;
//         next();
//     } catch (error) {
//         if (error.name === "JsonWebTokenError" ||
//             error.name === "TokenExpiredError") {
//             req.user = null;
//             res.locals.user = null;
//             return next();
//         }

//         next(error);
//     }
// };


// Makes req.user / res.locals.user available on every request
export function attachUser(req, res, next) {
  req.user = readUser(req.cookies.token);
  res.locals.user = req.user;
  next();
}

export const requireAuth = (req, res, next) =>{
 if (!req.user) return res.redirect('/login');
  next();

};