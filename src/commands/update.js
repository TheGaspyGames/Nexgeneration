const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Actualiza el bot desde GitHub')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply();

        try {
            await interaction.editReply('🔄 Iniciando actualización...');
            
            const { stdout: pullOutput } = await execPromise('git pull');
            await interaction.editReply(`🔄 Git pull completado:\n\`\`\`${pullOutput}\`\`\``);
            
            const { stdout: npmOutput } = await execPromise('npm install');
            await interaction.editReply(`📦 Dependencias actualizadas:\n\`\`\`${npmOutput}\`\`\``);
            
            await execPromise('pm2 restart nexgeneration-bot');
            await interaction.editReply('✅ Bot actualizado y reiniciado exitosamente.');
        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ Error durante la actualización:\n\`\`\`${error.message}\`\`\``);
        }
    },
};