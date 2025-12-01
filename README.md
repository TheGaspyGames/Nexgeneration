# Nexgeneration

Discord bot for managing server interactions such as suggestions, giveaways, and moderation helpers.

## Setup

Install the Python dependencies before running the bot:

```bash
pip install -r requirements.txt
```

Motor 3.x requires pymongo 4.x. The pinned versions in `requirements.txt` prevent the `_QUERY_OPTIONS` import error that appears when pymongo 5.x is installed.

## Troubleshooting

- If slash commands such as `/sugerir` are missing, make sure the bot has started without import errors so extensions like `pybot.commands.suggestions` can register their commands.
- Verify your environment matches the pinned dependencies if MongoDB-related imports fail.
