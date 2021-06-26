/**
 * @author - itsNaren
 * @description - User controller file
 * @date - 2021-05-30 21:25:45
**/
const User = require('../models/user');
const MedicalReport = require('../models/medical_report');
const { validate } = require('../utils/crypto');
const { sign } = require('../utils/jwt');
const { initAdmin, verifyOTP, toJapanese } = require('../utils/constant');
const { loadMulter } = require('../utils/multer');
const GENERATOR = require('../utils/string_generator');
const { sendMail } = require('../utils/mailer');
const { errorHandler, successHandler } = require('../utils/handler');
var xlstojson = require("xls-to-json-lc");
var xlsxtojson = require("xlsx-to-json-lc");



module.exports = {
    /**
     * For initialization purpose only
     */
    initUser: async () => {
        let isAdmin = await User.findOne({ name: initAdmin.name }).lean();
        if (!isAdmin) {
            User.create({ ...initAdmin, uuid: GENERATOR.generateUUID() }, (err, data) => {
                if (err) console.log('error');
            });
        }
    },
    /**
     * Web import users
     */
    importUsers: async (req, res) => {
        let upload = loadMulter(20).single('users-file');
        await upload(req, null, async (err) => {
            if (err) {
                errorHandler(req, res, err);
            }
            else {
                let dataError = false;
                if (req.file.originalname.split('.')[req.file.originalname.split('.').length - 1] === 'xlsx') {
                    exceltojson = xlsxtojson;
                } else {
                    exceltojson = xlstojson;
                }
                try {
                    exceltojson({
                        input: req.file.path,
                        output: null,
                        lowerCaseHeaders: false
                    }, async function (err, result) {
                        if (err) errorHandler(req, res, err);
                        else if (result.length > 0) {
                            result.map((e, i) => {
                                if (e.email == '' || e.email == undefined || e.email == null
                                    || e.empId == '' || e.empId == undefined || e.empId == null)
                                    dataError = true;
                                if (e.access)
                                    e.access = ((e.access).toUpperCase()).split(',');
                                else e.access = []
                                e.role = e.role ? (e.role).toUpperCase() : 'USER';
                                e.email = (e.email).toLowerCase();
                                e.uuid = GENERATOR.generateUUID();
                            });
                            let users = result;
                            if (dataError) errorHandler(req, res, new Error(toJapanese['Employee number and Email should not be empty, check the excel sheet properly']));
                            else {
                                await User.insertMany(users, (err, data) => {
                                    if (err) errorHandler(req, res, err);
                                    else
                                        successHandler(req, res, toJapanese['Data imported successfully'], {});
                                });
                            }

                        }
                        else errorHandler(req, res, new Error(toJapanese['Data is either empty or not valid']));

                    });
                } catch (e) {
                    errorHandler(req, res, err);
                }
            }
        });
    },
    /**
     * Web Registration
     */
    register: async (req, res) => {
        let userObj = req.body;
        userObj.uuid = GENERATOR.generateUUID();
        await User.create(userObj, (err, data) => {
            if (err) errorHandler(req, res, err);
            else successHandler(req, res, toJapanese['Success'], data);
        });
    },
    /**
     * Web Login
     */
    login: async (req, res) => {
        let { email, password } = req.body;
        let isUser = await User.findOne({ email }).lean();
        if (isUser) {
            if (validate(password, isUser.password)) {
                if (isUser.role.toLowerCase() == 'admin') {
                    let payload = {
                        empId: isUser.empId,
                        _id: isUser._id,
                        role: isUser.role,
                        uuid: isUser.uuid,
                        access: isUser.role.toLowerCase() == 'admin' ? isUser.access : []
                    };
                    successHandler(req, res, toJapanese['Login success'], {
                        token: sign(payload),
                        empId: isUser.empId,
                        name: isUser.name,
                        email: isUser.email,
                        uuid: isUser.uuid,
                        department: isUser.department,
                        registrationDate: isUser.registrationDate,
                        schedule: isUser.schedule,
                        gender: isUser.gender,
                        role: isUser.role
                    });
                }
                else errorHandler(req, res, new Error('Access denied, You\'re not authorized to access this portal'));
            }
            else errorHandler(req, res, new Error(toJapanese['Incorrect password, try again']))
        } else errorHandler(req, res, new Error(toJapanese['User does not exist']));
    },
    /**
     * Web dashboard
     */
    dashboard: async (req, res) => {
        let total = 0, registered = 0, infected = 0, unregistered = 0;
        let access = req.verifiedToken.access;
        let subQuery = { 'department': { $ne: 'ALL' } };
        let matchQuery = {
            $or: [
                { bodyTemperature: { $gt: 37.4 } },
                { antigen: { $in: ['陽性', '擬陽性'] } },
                {
                    'qa.question': '1 状態（必須）',
                    'qa.answer': {
                        '$in': [
                            '病状らしき事象あり', '体調不良（自宅療養）', '体調不良（病院通院）'
                        ]
                    }
                }
            ]
        };
        matchQuery.department = { $ne: 'ALL' };
        if (access.length > 0 && access[0] != 'ALL') {
            subQuery = { 'department': { $in: access } };
            matchQuery.department = { $in: department };
        }
        Promise.all([
            await User.find(subQuery).lean(),
            await MedicalReport.aggregate([
                {
                    '$match': matchQuery
                },
                {
                    '$sort': { 'empId': 1, 'createdAt': -1 }
                },
                {
                    '$group': {
                        '_id': '$empId',
                        'date': {
                            '$first': '$createdAt'
                        }
                    }
                }
            ]),
            await MedicalReport.find({ createdAt: { $gt: new Date().setHours(0, 0, 0, 0) } }).lean()
        ]).then((data) => {
            let users = data[0], reports = data[1] ;
            total = users.length;
            infected = reports.length;
            registered = data[2].length;
            unregistered = total - registered;
            successHandler(req, res, toJapanese['Success'], { total, registered, infected, unregistered });
        }).catch(e => errorHandler(req, res, e));


    },
    /**
     * Web list employees
     */
    listEmployee: async (req, res) => {
        let access = req.verifiedToken.access;
        let subQuery = { name: { $ne: 'admin' }, department: { $ne: 'ALL' } };
        if (access.length > 0 && access[0] != 'ALL') {
            subQuery.department = { $in: access };
        }
        await User.find(subQuery, 'empId email department gender role name mobile')
            .exec((err, data) => {
                if (err) errorHandler(req, res, err);
                else successHandler(req, res, toJapanese['Data listed successfully'], data);
            })
    },
    /**
     * Web add employee
     */
    addEmployee: async (req, res) => {
        let userObj = req.body;
        userObj.uuid = GENERATOR.generateUUID();
        await User.create(userObj, (err, data) => {
            if (err) errorHandler(req, res, err);
            else successHandler(req, res, toJapanese['Data created successfully'], { success: true });
        })
    },
    /**
     * Mobile register
     */
    mRegister: async (req, res) => {
        let { email, otp } = req.body;
        let user = await User.findOne({ email: email });
        let isVerified = verifyOTP(otp, user.verify);
        if (isVerified) {
            user.status = true;
            await user.save();
            successHandler(req, res, toJapanese['Success'], { verified: true });
        }
        else errorHandler(req, res, new Error(toJapanese['Invalid OTP, try again']));
    },
    /**
     * Mobile login
     */
    mLogin: async (req, res) => {
        let { fcmToken = '', email, password } = req.body;
        let isUser = await User.findOne({ email });
        if (isUser) {
            if (!isUser.status) errorHandler(req, res, new Error(toJapanese['Email not verified yet']));

            else if (validate(password, isUser.password)) {
                if (fcmToken) {
                    isUser.fcmToken = fcmToken;
                    await isUser.save();
                }
                let payload = {
                    empId: isUser.empId,
                    _id: isUser._id,
                    role: isUser.role,
                    uuid: isUser.uuid,
                    access: isUser.role.toLowerCase() == 'admin' ? isUser.access : []
                };
                successHandler(req, res, toJapanese['Login success'], {
                    token: sign(payload),
                    name: isUser.name,
                    empId: isUser.empId,
                    email: isUser.email,
                    uuid: isUser.uuid,
                    department: isUser.department,
                    registrationDate: isUser.registrationDate,
                    schedule: isUser.schedule,
                    gender: isUser.gender,
                    role: isUser.role
                });
            } else errorHandler(req, res, new Error(toJapanese['Incorrect password, try again']));
        } else errorHandler(req, res, new Error(toJapanese['User does not exist']));
    },
    /**
     * Request OTP
     */
    requestOTP: async (req, res) => {
        let isUser = await User.findOne({ email: req.body.email });
        if (!isUser) errorHandler(req, res, new Error(toJapanese['User is not exist, kindly ask admin']));
        else {
            let otp = GENERATOR.generateOTP();
            sendMail(req, res,
                {
                    to: isUser.email,
                    subject: 'Request to verify your account',
                },
                {
                    fullname: isUser.name,
                    otp: otp,
                    message: 'verify your account'
                }
                , 'otp-template.html'
            ).then(async () => {
                isUser.verify = { otp: otp };
                await isUser.save();
                successHandler(req, res, toJapanese['OTP sent successfully'], { success: true })
            }).catch(e => errorHandler(req, res, e));
        }
    },
    /**
     * Reset password
     */
    resetPassword: async (req, res) => {
        let { email, otp, password } = req.body;
        let isUser = await User.findOne({ email });
        if (!isUser) errorHandler(req, res, new Error(toJapanese['Something went wrong']));
        else if (verifyOTP(otp, isUser.verify)) {
            isUser.password = password;
            await isUser.save();
            successHandler(req, res, toJapanese['Password updated successfully'], { success: true });
        }
        else errorHandler(req, res, new Error(toJapanese['Invalid OTP, try again']));
    },
    /**
     * Verify account
     */
    verifyAccount: async (req, res) => {
        let { email, otp } = req.body;
        let isUser = await User.findOne({ email });
        if (!isUser) errorHandler(req, res, new Error(toJapanese['Something went wrong']));
        else {
            if (isUser.verify.otp == otp) {
                isUser.status = true;
                await isUser.save();
                successHandler(req, res, toJapanese['OTP verified successfully'], { success: true });
            }
            else errorHandler(req, res, new Error(toJapanese['Invalid OTP, try again']));
        }
    }
}