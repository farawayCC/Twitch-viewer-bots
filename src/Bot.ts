import BotLogic from "./BotLogic.js";
import config from "./config.js";
import logging from "improved-logging";
import puppeteer from "puppeteer-core";
import selectors from "./selectors.js";
import fs from "fs";



export default class Bot extends BotLogic {

    constructor(token: string, proxy?: string) {
        super(token, proxy);
    }


    async start() {
        // Start bot
        logging.info("Starting bot... For streamer: " + config.streamer);
        await this.startWatching();
        logging.info("Setting username...");
        await this.setUsername(this.streamPage);

        this.checkUsername();

        if (config.adultcontent) {
            try {
                await this.checkAdultStream();
            } catch { }
        } else {
            logging.error(`Adult stream is selected when "adultcontent" mode is off`);
            process.exit(1);
        }
        if (config.quality160p) {
            logging.info(`${this.user} starting change quality...`);
            try {
                await this.changeQuality();
            } catch {
                logging.error(`${this.user} Quality change error. Current - automatic quality`);
            }
        }

        logging.info(`${this.user} watch ${config.streamer} now`);
        if (config.browsers)
            await this.streamPage.keyboard.press("m");


        logging.info("Starting online check intervals...");
        await this.onlineInterval(this);
        const context = this;
        setInterval(() => this.onlineInterval(context), config.onlineinterval);

        // screenshot interval
        setInterval(() => this.screenshotInterval(context), config.screenshotInterval)
        return this;
    }

    async screenshotInterval(context: any) {
        // empty and ensure folder
        if (fs.existsSync("./screenshots"))
            fs.rmdirSync("./screenshots", { recursive: true });
        fs.mkdirSync("./screenshots");

        // prepare to screenshot: zoom out the chrome page
        await context.streamPage.evaluate(() => {
            // @ts-ignore
            document.body.style.zoom = "65%";
        });

        // make screenshot
        context.streamPage.screenshot({ path: `./screenshots/${context.user}.png` });
    }



    async getOnline(page: puppeteer.Page) {
        try {
            await page.waitForSelector(selectors.online, { timeout: 10_000 });
            return await page.evaluate((onlineSelector) => {
                // @ts-ignore
                return document.querySelector(onlineSelector).innerText;
            }, selectors.online);
        } catch {
            return false;
        }
    }


    async onlineInterval(context: any) {
        logging.info("Checking streamer online...");
        let online = await context.getOnline(context.streamPage);
        if (!online) {
            logging.warn(`${config.streamer} is offline now`);
            logging.error('Stream is over. Please restart bot');
            process.exit(1);

        } else {
            logging.info(`${config.streamer} is online`);
        }
    }

    async checkGoToLoad(fgoto: Function) {
        try {
            fgoto();
        } catch {
            logging.error("Failed to load page, please check your internet connection");
            process.exit(1);
        }
    }

    async startWatching() {
        this.browser = await puppeteer.launch(this.browserConfig);
        this.streamPage = await this.browser.newPage();
        await this.streamPage.setUserAgent(config.userAgent);
        await this.streamPage.setCookie(this.cookie);
        this.browser.on("disconnected", () => {
            logging.error(`Browser closed`);
            process.exit(1);
        });
        await this.streamPage.setDefaultNavigationTimeout(0);
        await this.streamPage.setDefaultTimeout(0);


        this.checkGoToLoad(async () => {
            await this.streamPage.goto(`https://www.twitch.tv/${config.streamer}`);
            // await this.streamPage.goto(`http://www.icanhazip.com`);
        });

        // give time to load
        await this.streamPage.waitForSelector(selectors.settingsButton, { timeout: 10_000 })
    }

    async checkAdultStream() {
        await this.streamPage.waitForSelector(selectors.adultContent, { timeout: 5_000 });
        await this.streamPage.evaluate((adultContentSelector: string) => {
            const obj = document.querySelector(adultContentSelector);
            if (!obj) return;
            // @ts-ignore
            obj.click();
        }, selectors.adultContent);
        logging.info(`${this.user} adult stream accepted`);
    }

    /**
     * Set bot username. Mined from cookies
     * @param page 
     */
    async setUsername(page: puppeteer.Page) {
        let cookies = await page.cookies();
        for (let i = 0; i < cookies.length; i++) {
            let c = cookies[i];
            if (c.name === "twilight-user") {
                let start = c.value.indexOf("displayName%22:%22") + "displayName%22:%22".length;
                let end = c.value.indexOf("%22%2C%22id%");
                this.user = c.value.substring(start, end)
            }
        }
    }

    /**
     * Check if username is set, if not - exit
     */
    checkUsername() {
        if (!this.user) {
            logging.error("Token is invalid: username not found");
            process.exit(1);
        }
    }


    async changeQuality() {
        const page = this.streamPage;
        try {
            await page.waitForSelector(selectors.settingsButton, { timeout: 5_000 });
            await page.evaluate((settingsButtonSelector: string) => {
                // @ts-ignore
                document.querySelector(settingsButtonSelector).click();
            }, selectors.settingsButton);
            await page.waitForSelector(selectors.qualitySettingsButton, { timeout: 5_000 });
            await page.evaluate((qualitySettingsButtonSelector: string) => {
                // @ts-ignore
                document.querySelector(qualitySettingsButtonSelector).click();
            }, selectors.qualitySettingsButton);
            await page.waitForSelector(selectors.quality, { timeout: 5_000 });
            logging.info(`${this.user} change stream quality to 160p`);
            await page.evaluate((qualitySelector: string) => {
                let qualities = Array.from(document.querySelectorAll(qualitySelector));
                let lowQuality = qualities[qualities.length - 1];
                // @ts-ignore
                lowQuality.querySelector("input").click();
            }, selectors.quality);
        } catch {
            logging.error(`${this.user} Quality change error. Current - automatic quality`);
        }
    }

}
