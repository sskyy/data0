import Koa from 'koa'
import { koaBody } from "koa-body";
import koaRoute from 'koa-route'
import cors from '@koa/cors'
import getPort, {portNumbers} from "get-port";
import commandLineArgs from 'command-line-args'
import {readdir, readFile, writeFile, mkdir, rmdir, unlink} from "fs/promises";
import {readFileSync} from "fs";
import {ContextWithBodyAndFiles} from "koa-body/lib/utils/patch-util";
import {setup} from "./setup";
import {MemorySystem} from "./runtime/MemorySystem";


const DEFAULT_API_SERVER_PORT = 3000

const optionDefinitions = [
    { name: 'port', alias: 'p', type: Number },
]
const options = commandLineArgs(optionDefinitions, { partial: true })


setup({
    serviceAPIs: {
        readdir,
        mkdir,
        rmdir,
        readFile,
        writeFile,
        unlink,
    },
    port : options.port || DEFAULT_API_SERVER_PORT,
    path: '/api'
})

// TODO cal interaction api

const userRole: RoleType = {
    type: 'role',  // role type
    attributes: {
        id: Types.Id,
        name: Types.String
    }
}

const system = new MemorySystem()
const indexAndConverted = recursiveConvertActivityInteraction(activity, [], activity, { userRole })