# Reveal Server

## Installation

Install dependent packages with npm:

```
npm i
```

## Usage

Run on your server.  Specify a secret with the `s` option.  Create a webhook that fires on the "push" event.

Ensure that your repo has a "website" configured.  The last component of this path will be used on the server.

## Docker

There are some environment variables that can be used to configure the server:

* *RV_PREFIXES*: A comma-separated list of acceptable prefixes.  For example, to allow GitHub, set `RV_PREFIXES=https://github.com`, or to enable only your repo set `RV_PREFIXES=https://github.com/username/`.  If a prefix does not match, it will not be loaded.
* *RV_SECRET*: The contents of a secret that is shipped as part of the webhook.
* *RV_LISTEN_PORT*: The port number to listen to. Defaults to `9119`.
* *RV_LISTEN_ADDR*: The local address to listen to.  Defaults to `0.0.0.0`
* *RV_ROOT*: The root where all repos will go to.
