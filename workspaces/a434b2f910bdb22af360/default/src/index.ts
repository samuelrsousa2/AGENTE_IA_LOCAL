import Phaser from 'phaser';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

const game = new Phaser.Game(config);

function preload() {
  this.load.image('ship', 'assets/ship.png');
}

function create() {
  const ship = this.add.sprite(400, 300, 'ship').setScale(0.5);
}

function update() {
  // Update game logic here
}