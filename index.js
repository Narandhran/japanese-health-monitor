/**
 * @author - itsNaren
 * @description - User controller file
 * @date - 2021-05-30 20:06:21
**/
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const { json, urlencoded } = require('body-parser');
const app = express();

const config = require('./config/index');
const { connectivity } = require('./config/db');
const logger = require('./utils/logger');

const swaggerDocument = YAML.load('./config/swagger.yaml');
swaggerDocument.host = process.env.SWAGGER_URI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const { initUser } = require('./controllers/user');
var normalizedPath = require('path').join(__dirname, 'routes');

app
    .use(cors())
    .use(morgan('dev'))
    .use(json({ limit: '3mb', extended: true }))
    .use(urlencoded({ limit: '3mb', extended: true }))
    .use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, HEAD, PATCH');
        next();
    })
    .listen(config.server.port, () => {
        var get_connection = connectivity();
        get_connection.on('error', (err) => {
            console.error(err);
            process.exit(1);
        });
        get_connection.once('open', () => {
            require('fs')
                .readdirSync(normalizedPath)
                .forEach(file => {
                    require('./routes/' + file)(app);
                });
            initUser();
            console.log('Server started successfully!')
            // logger.info('Server started successfully!')
        });
    });
module.exports = app;