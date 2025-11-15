const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../config/config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Configura el sistema de automoderación')
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Activa o desactiva la automoderación'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('maxmentions')
                .setDescription('Configura el máximo de menciones permitidas')
                .addIntegerOption(option =>
                    option.setName('cantidad')
                        .setDescription('Número máximo de menciones permitidas')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(25)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('addword')
                .setDescription('Añade una palabra a la lista de palabras prohibidas')
                .addStringOption(option =>
                    option.setName('palabra')
                        .setDescription('La palabra que será prohibida')
                        .setRequired(false))
                .addAttachmentOption(option =>
                    option.setName('archivo')
                        .setDescription('Archivo .txt con palabras separadas por comas')
                        .setRequired(false)))

        .addSubcommand(subcommand =>
            subcommand
                .setName('removeword')
                .setDescription('Remueve una palabra de la lista de palabras prohibidas')
                .addStringOption(option =>
                    option.setName('palabra')
                        .setDescription('La palabra que será removida')
                        .setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'toggle': {
                config.autoModeration.enabled = !config.autoModeration.enabled;
                await interaction.reply({
                    content: `✅ La automoderación ha sido ${config.autoModeration.enabled ? 'activada' : 'desactivada'}.`,
                    ephemeral: true
                });
                break;
            }
            case 'maxmentions': {
                const amount = interaction.options.getInteger('cantidad');
                config.autoModeration.maxMentions = amount;
                await interaction.reply({
                    content: `✅ El máximo de menciones ha sido establecido a ${amount}.`,
                    ephemeral: true
                });
                break;
            }
            case 'addword': {
                const singleWord = interaction.options.getString('palabra');
                const file = interaction.options.getAttachment('archivo');

                if (!singleWord && !file) {
                    await interaction.reply({
                        content: '❌ Debes proporcionar una palabra o un archivo .txt con palabras separadas por comas.',
                        ephemeral: true
                    });
                    return;
                }

                const newWords = [];

                if (singleWord) {
                    newWords.push(singleWord);
                }

                if (file) {
                    if (!file.name.toLowerCase().endsWith('.txt')) {
                        await interaction.reply({
                            content: '❌ Solo se aceptan archivos de texto con extensión .txt.',
                            ephemeral: true
                        });
                        return;
                    }

                    const MAX_FILE_SIZE = 256 * 1024; // 256 KB
                    if (file.size && file.size > MAX_FILE_SIZE) {
                        await interaction.reply({
                            content: `❌ El archivo es demasiado grande. Tamaño máximo permitido: ${Math.round(MAX_FILE_SIZE / 1024)} KB.`,
                            ephemeral: true
                        });
                        return;
                    }

                    try {
                        const response = await fetch(file.url);
                        if (!response.ok) {
                            throw new Error(`Estado ${response.status}`);
                        }
                        const content = await response.text();
                        const parsedWords = content
                            .replace(/\r?\n/g, ',')
                            .split(',')
                            .map(word => word.trim())
                            .filter(Boolean);

                        if (!parsedWords.length) {
                            await interaction.reply({
                                content: '❌ El archivo no contiene palabras válidas separadas por comas.',
                                ephemeral: true
                            });
                            return;
                        }

                        newWords.push(...parsedWords);
                    } catch (error) {
                        console.error('Error al procesar archivo de automod:', error);
                        await interaction.reply({
                            content: '❌ Ocurrió un error al leer el archivo. Asegúrate de que sea accesible y vuelva a intentarlo.',
                            ephemeral: true
                        });
                        return;
                    }
                }

                const normalizedNewWords = newWords.map(word => word.toLowerCase()).filter(Boolean);

                if (!normalizedNewWords.length) {
                    await interaction.reply({
                        content: '❌ No se han proporcionado palabras válidas para añadir.',
                        ephemeral: true
                    });
                    return;
                }

                const uniqueNewWords = [...new Set(normalizedNewWords)];
                const existingWords = config.autoModeration.bannedWords.map(word => word.toLowerCase());

                const wordsToAdd = uniqueNewWords.filter(word => !existingWords.includes(word));
                const duplicates = uniqueNewWords.length - wordsToAdd.length;

                if (wordsToAdd.length) {
                    config.autoModeration.bannedWords.push(...wordsToAdd);
                }

                await interaction.reply({
                    content: wordsToAdd.length
                        ? `✅ Se han añadido ${wordsToAdd.length} palabra(s) a la lista prohibida.${duplicates ? ` (${duplicates} ya estaban añadidas)` : ''}`
                        : '⚠️ Todas las palabras proporcionadas ya estaban en la lista prohibida.',
                    ephemeral: true
                });
                break;
            }

            case 'removeword': {
                const word = interaction.options.getString('palabra').toLowerCase();
                const index = config.autoModeration.bannedWords.indexOf(word);
                if (index > -1) {
                    config.autoModeration.bannedWords.splice(index, 1);
                    await interaction.reply({
                        content: '✅ Palabra removida de la lista de palabras prohibidas.',
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: '❌ Esta palabra no está en la lista de palabras prohibidas.',
                        ephemeral: true
                    });
                }
                break;
            }
        }
    },
};