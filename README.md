# apify-act-manager
Apify act for running a list of crawlers in an optimal manner.

This act takes a list of crawlers and runs them in parallel. It always tries to run as many of the crawlers as possible, until all of them are finished. You can limit the maximum number of crawlers running in parallel.

This act is a combination of the following acts:
https://github.com/cermak-petr/act-crawl-manager
https://github.com/cermak-petr/act-executions-merge


**INPUT**

Input is a JSON object with the following properties:

```javascript
{
    // maximum number of crawlers running in parallel
    "parallel": N_OF_RUNNING,

    // final webhook
    "finalWebhook": FINAL_WEBHOOK,
    
    // list of crawlers
    "crawlers": [
        {
            "id": CRAWLER_ID,
            "settings": CRAWLER_SETTINGS
        },
        ...
    ]

    // Email to send the Crawler Results
    "email" : EMAIL_ID,

    // Minimum number of records expected from all the Crawlers
    "minLength" : 100
}
```

If you set the "finalWebhook" attribute, when all of the crawlers finish a POST request will be sent to the "finalWebhook" URL. The body of the request combines all the results from the crawlers and will be as follows:

```javascript
{  
    // list of finished executions
    "_json": "[EXECUTION_ID_1_RESULTS,EXECUTION_ID_2_RESULTS..EXECUTION_ID_N_RESULTS]"
}
```

This JSON will also be saved as the act's OUTPUT value.
