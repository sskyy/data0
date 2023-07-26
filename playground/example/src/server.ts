import Koa from 'koa'
import { koaBody } from "koa-body";
import koaRoute from 'koa-route'
import cors from '@koa/cors'
import getPort, {portNumbers} from "get-port";
import commandLineArgs from 'command-line-args'
import {readdir, readFile, writeFile, mkdir, rmdir, unlink} from "fs/promises";
import {readFileSync} from "fs";
import {ContextWithBodyAndFiles} from "koa-body/lib/utils/patch-util";


const DEFAULT_API_SERVER_PORT = 3000

type SetupArg = {
    serviceAPIs: {
        [k: string]: (...args: any[]) => any,
    },
    path?: string,
    port: number
}
export async function setup({serviceAPIs = {}, path = '/api', port } : SetupArg) {
    const server = new Koa()
    server.use(koaBody({
        formLimit: '30mb',
        multipart: true,
    }))
    server.use(cors())

    const availableViewPort = await getPort({ port: portNumbers(port, port + 100)})

    server.use(koaRoute.post('/api', useAPI(serviceAPIs)))
    server.listen(availableViewPort)
    console.log(`backend server started on port ${port}.`)
    return port
}

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






function useAPI(serviceAPIs: SetupArg['serviceAPIs']) {
    return  async (ctx: ContextWithBodyAndFiles, next: (...args: any[]) => any) => {
        // CAUTION 未来还可以支持其他的控制参数
        const { method, argv } = ctx.request.body
        console.log(`calling ${method}`)
        if (!serviceAPIs[method]) {
            next()
            return
        }

        let result
        let hasError
        try {
            const argvToHandle = (typeof argv === 'string') ? JSON.parse(argv) : argv
            const argvWithFile = argvToHandle.map((a: any) => {
                if (typeof a === 'string' && /^__file\./.test(a)){
                    // @ts-ignore
                    return readFileSync(ctx.request.files![a.split('.').pop()!].path!)
                }
                return a
            })

            console.log(argvWithFile)
            result = await serviceAPIs[method](...argvWithFile)
        } catch( e: any ) {
            console.error(e)
            hasError = true
            ctx.status = 500
            ctx.body = {
                name: e.name,
                message: e.message,
                stack: e.stack
            }
        }

        if (!hasError) {
            ctx.status = 200
            ctx.body = {
                result
            }
        }
    }
}