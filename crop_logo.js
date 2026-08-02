import { Jimp } from 'jimp';

async function processImage() {
  const inputFile = 'Logo PNG nuevo.png';
  console.log('Loading image...');
  const image = await Jimp.read(inputFile);

  console.log('Autocropping...');
  image.autocrop();

  // Resize the image keeping it centered, Jimp will do this by default if we just resize
  image.resize({ w: 512, h: 512 });
  await image.write('public/logo512.png');
  await image.write('public/logo.png');
  
  image.resize({ w: 192, h: 192 });
  await image.write('public/logo192.png');

  image.resize({ w: 64, h: 64 });
  await image.write('public/favicon.png');

  console.log('Done!');
}

processImage().catch(console.error);
