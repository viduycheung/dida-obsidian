# DIDA(滴答清单) for Obsidian

DIDA is a powerful to-do & task management app with seamless cloud synchronization across all your devices.

This plugin integrates with [DIDA](https://dida365.com), allowing you to easily transform and sync data between DIDA and Obsidian.

## Build
```shell
git clone git@github.com:how2051/dida-obsidian.git
cd dida-obsidian
npm install
npm run dev
```

## Manually install
copy `main.js`, `manifest.json`, `styles.css` to your `.obsidian/plugins`


## Usage
To use the plugin, you should first log into DIDA via the plugin settings. Once that’s done, you can access the commands as needed.

## Features
you can bind the commands to hotkeys you like
- Create task: select some text and create a task
- Complete task: select the same text and complete the task

## Dev Info
Make sure your NodeJS is at least v16 (`node --version`)
