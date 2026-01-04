"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const configuration_1 = __importDefault(require("./config/configuration"));
const auth_module_1 = require("./auth/auth.module");
const sessions_module_1 = require("./sessions/sessions.module");
const codes_module_1 = require("./codes/codes.module");
const relay_module_1 = require("./relay/relay.module");
const billing_module_1 = require("./billing/billing.module");
const health_controller_1 = require("./health/health.controller");
const user_entity_1 = require("./entities/user.entity");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [configuration_1.default],
            }),
            typeorm_1.TypeOrmModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    type: 'postgres',
                    url: configService.get('database.url'),
                    autoLoadEntities: true,
                    synchronize: process.env.NODE_ENV !== 'production',
                }),
            }),
            typeorm_1.TypeOrmModule.forFeature([user_entity_1.User]),
            auth_module_1.AuthModule,
            sessions_module_1.SessionsModule,
            codes_module_1.CodesModule,
            relay_module_1.RelayModule,
            billing_module_1.BillingModule,
        ],
        controllers: [health_controller_1.HealthController],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map