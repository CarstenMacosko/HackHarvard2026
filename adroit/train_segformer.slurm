#!/bin/bash
#SBATCH --job-name=vf-segformer
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --gres=gpu:1
#SBATCH --time=03:00:00
#SBATCH --output=slurm-%j.out

module purge
module load anaconda3/2024.6
conda activate vf-train

cd "$SLURM_SUBMIT_DIR"  # submit from adroit/ with data/ next to this script
python train_segformer.py --data data --out segformer-skin --epochs 15
