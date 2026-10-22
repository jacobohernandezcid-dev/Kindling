scoreboard objectives add kl_boot dummy
execute unless score kl kl_boot matches 1 run tellraw @a {"rawtext":[{"text":"§eKindling Body data is on"}]}
scoreboard players set kl kl_boot 1
