

export const showLogin = (req, res) => {
 res.render('auth/login', { error: null });
}

export const showRegister = (req, res) => {
 res.render('auth/register', { error: null })
};