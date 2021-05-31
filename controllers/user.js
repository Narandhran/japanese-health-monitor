/**
 * @author - itsNaren
 * @description - User controller file
 * @date - 2021-05-30 21:25:45
**/
const User = require('../models/user');
const { validate } = require('../utils/crypto');
const { sign } = require('../utils/jwt');
const { countryCode, initAdmin, verifyOTP } = require('../utils/constant');
const GENERATOR = require('../utils/string_generator');
const { errorHandler, successHandler } = require('../utils/handler');



module.exports = {
    /**
     * For initialization purpose only
     */
    initUser: async () => {
        let isAdmin = await User.findOne({ name: initAdmin.name }).lean();
        if (!isAdmin) {
            User.create({ ...initAdmin, uuid: GENERATOR.generateUUID(userObj.empId) }, (err, data) => {
                if (err) console.log('error');
            });
        }
    },
    /**
     * Web Registration
     */
    register: async (req, res) => {
        let userObj = req.body;
        userObj.uuid = GENERATOR.generateUUID(userObj.empId);
        await User.create(userObj, (err, data) => {
            if (err) errorHandler(req, res, err);
            else successHandler(req, res, 'Success', data);
        });
    },
    /**
     * Web Login
     */
    login: async (req, res) => {
        let { email, password } = req.body;
        let isUser = await User.findOne({ email }).lean();
        if (isUser && validate(password, isUser.password)) {
            let payload = {
                empId: isUser.empId,
                _id: isUser._id,
                role: isUser.role,
                access: isUser.role.toLowerCase() == 'admin' ? isUser.access : ['none']
            };
            successHandler(req, res, 'Login success', sign(payload));
        } else errorHandler(req, res, new Error('User not exist!!'));
    },
    /**
     * Web dashboard
     */
    dashboard: async (req, res) => {
        let total = 0, registered = 0, infected = 0, unregistered = 0;
        await User.find({}, (err, data) => {
            if (err) errorHandler(req, res, err);
            else {
                data.forEach((user, index) => {
                    total += 1;
                    if (user.status) registered += 1;
                    else unregistered += 1;
                    if (user.isInfected) infected += 1;
                });
            }
            successHandler(req, res, 'Success', { total, registered, infected, unregistered });
        });
    },
    /**
     * Web add employee
     */
    addEmployee: async (req, res) => {
        let userObj = req.body;
        userObj.uuid = GENERATOR.generateUUID(userObj.empId);
        await User.create(userObj, (err, data) => {
            if (err) errorHandler(req, res, err);
            else successHandler(req, res, 'User added successfully!!', {});
        })
    },
    /**
     * Mobile register
     */
    mRegister: async (req, res) => {
        let { email, otp } = req.body;
        let user = await User.findOneAndUpdate({ email: email });
        let isVerified = verifyOTP(otp, user.verify);
        if (isVerified) {
            user.status = true;
            await user.save();
            successHandler(req, res, 'Success', { verified: true });
        }
        else errorHandler(req, res, new Error('Invalid OTP, try again!'));
    },
    /**
     * Mobile login
     */
    mLogin: async (req, res) => {
        let { email, password } = req.body;
        let isUser = await User.findOne({ email }).lean();
        if (!isUser.status) errorHandler(req, res, new Error('Email not verified yet!!'));
        else if (isUser && validate(password, isUser.password)) {
            let payload = {
                empId: isUser.empId,
                _id: isUser._id,
                role: isUser.role,
                access: isUser.role.toLowerCase() == 'admin' ? isUser.access : ['none']
            };
            successHandler(req, res, 'Login success', { uuid: isUser.uuid, token: sign(payload) });
        } else errorHandler(req, res, new Error('User not exist!!'));
    },
    /**
     * Request OTP
     */
    requestOTP: async (req, res) => {
        let isUser = await User.findOne({ email: req.body.email });
        if (!isUser) errorHandler(req, res, new Error('User is not exist, kindly ask admin!!'));
        else {
            //Mail logic to send OTP
            successHandler(req, res, 'OTP send successfully!!', {});
        }
    },
    /**
     * Reset password
     */
    resetPassword: async (req, res) => {
        let { email, otp, password } = req
        let isUser = await User.findOne({ email });
        if (!isUser) errorHandler(req, res, new Error('Something went wrong!!'));
        else if (verifyOTP(otp, isUser.verify)) {
            isUser.password = password;
            await isUser.save();
            successHandler(req, res, 'Password updated successfully!', {});
        }
        else errorHandler(req, res, new Error('Invalid OTP, try again!'));

    },
}