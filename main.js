const Apify = require('apify');
const _ = require('underscore');
const Promise = require('bluebird');
Apify.setPromisesDependency(Promise);
const request = require('request-promise');

let input, state;
const output = {executionIds: []};

async function saveState(newState){
    for(var key in newState){
        state[key] = newState[key];
    }
    await Apify.setValue('STATE', state);
}

async function isCrawlerRunning(crawlerId){
    const exec = await Apify.client.crawlers.getLastExecution({crawlerId: crawlerId});
    if(!exec || exec.status === 'RUNNING'){
        return true;
    }else{
        return false;
    }
}

function waitForCrawlerFinish(crawlerId){
    return new Promise((resolve, reject) => {
        const interval = setInterval(async function(){
            const exec = await Apify.client.crawlers.getLastExecution({crawlerId: crawlerId});
            if(exec && exec.status != 'RUNNING'){
                clearInterval(interval);
                resolve(exec);
            }
        }, 1000);
    });
}

async function postWebhook(url, body){
    const options = {
        method: 'POST',
        uri: url,
        body: JSON.stringify(body),
        json: true
    };
    await request(options);
}

function runActions(actions, parallels){
    return new Promise((resolve, reject) => {
        let toRun = 0;
        let running = 0;
        const done = state.done || Array(actions.length).fill(false);
        const getNext = () => _.findIndex(done, (e) => e === false);
        const results = [];
        const runNext = () => {
            const current = getNext();
            if(current > -1){
                running++;
                done[current] = null;
                actions[current]().then(async (result) => {
                    running--;
                    done[current] = true;
                    results.push(result);
                    await saveState({done: done.map((val) => val ? true : false)});
                    if(getNext() > -1 && running < parallels){
                        runNext();
                    }
                    else if(running === 0){resolve(results);}
                });
            }
        }
        _.each(actions.slice(0, Math.min(parallels, actions.length)), runNext);
    });
}

function createCrawlerActions(crawlers){
    const actions = [];
    _.each(crawlers, (crawler) => {
        actions.push(async () => {
            if(!(await isCrawlerRunning(crawler.id))){
                console.log('starting crawler: ' + crawler.id);
                await Apify.client.crawlers.startExecution({
                    crawlerId: crawler.id, 
                    settings: crawler.settings
                });
            }
            else{console.log('waiting for crawler: ' + crawler.id);}
            const run = await waitForCrawlerFinish(crawler.id);
            output.executionIds.push(run._id);
            console.log('crawler finished: ' + crawler.id);
        });
    });
    return actions;
}

function processResults(results, output){
    _.each(results.items, function(item, index){
        const pfr = item.pageFunctionResult;
        if(pfr){
            if(Array.isArray(pfr) && pfr.length > 0){
                output = output.concat(pfr);
            }
            else{output.push(pfr);}
        }
    });
    return output;
}

async function getExecutionResults(execId){
    let output = [];
    const limit = 200;
    let total = null, offset = 0;
    while(total === null || offset + limit < total){
        const results = await Apify.client.crawlers.getExecutionResults({executionId: execId, limit: limit, offset: offset});
        output = processResults(results, output);
        total = results.total;
        offset += limit;
    }
    return output;
}

async function getAllExecutionResults(execIds){
    let results = [];
    const execPromises = [];
    _.each(execIds, function(eId){
        console.log('getting execution results: ' + eId);
        const ePromise = getExecutionResults(eId);
        ePromise.then(function(result){
            results = results.concat(result);
        });
        execPromises.push(ePromise);
    });
    await Promise.all(execPromises);
    console.log('all executions retrieved');
    return results;
}


Apify.main(async () => {
    input = await Apify.getValue('INPUT');
    state = (await Apify.getValue('STATE')) || {};
    
    if(!input.crawlers){return console.log('missing "crawlers" attribute in INPUT');}
    if(!input.parallel){input.parallel = 5;}
    
    const actions = createCrawlerActions(input.crawlers);
    await runActions(actions, input.parallel);

    const results = await getAllExecutionResults(output.executionIds);
    await Apify.setValue('OUTPUT', results);
    if(input.finalWebhook){
        await postWebhook(input.finalWebhook, results);
    }
});
