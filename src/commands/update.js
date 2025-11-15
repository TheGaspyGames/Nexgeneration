const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const pm2Command = process.env.PM2_CMD || 'pm2';

async function ensurePm2Available() {
    try {
        await execPromise(`${pm2Command} -v`);
        return pm2Command;
    } catch (error) {
        const errorOutput = `${error.stdout || ''}\n${error.stderr || ''}`.toLowerCase();
        if (error.code === 'ENOENT' || errorOutput.includes('not found') || errorOutput.includes('no such file')) {
            throw new Error(
                'pm2 no está instalado o no se encuentra en el PATH del sistema. ' +
                'Instálalo globalmente con `npm install -g pm2` o define la variable de entorno PM2_CMD con la ruta completa.'
            );
        }
        throw error;
    }
}

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

            const pm2Cli = await ensurePm2Available();
            await execPromise(`${pm2Cli} restart nexgeneration-bot`);
            await interaction.editReply('✅ Bot actualizado y reiniciado exitosamente.');
        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ Error durante la actualización:\n\`\`\`${error.message}\`\`\``);
        }
    },
};