import bcrypt from "bcryptjs";
import User from "../models/userModel.js";
import {signToken} from '../middlewares/authMiddleware.js'

const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
}

export const showLogin = (req, res) => {
 res.render('auth/login', { error: null });
}

export const showRegister = (req, res) => {
 res.render('auth/register', { error: null })
};

export  const postRegister  = async (req, res) => {
 const { name, email, password } = req.body;
 console.log(req.body);
 if (!name || !email || !password || password.length < 6){
    return res.render('auth/register', {error: "Enter your name, email and a password of at least 6 characters."});
 }
 try{
   const cleanEmail = email.trim().toLowerCase();
   const cleanName = name.trim();

   if(await User.findByEmail(cleanEmail)){
    return res.render('auth/register', {error: "This email is already registered. Log in instead."})
   }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = await User.create({ name: cleanName, email: cleanEmail, passwordHash });

    res.cookie('token', signToken({ id, name: cleanName, email: cleanEmail }), cookieOpts);
    res.redirect('/login');

   }catch(error){
console.error(error);
    res.render('auth/register', { error: 'Could not create the account. Try again.' });
 }
}