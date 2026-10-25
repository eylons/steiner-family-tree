import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let fileManager = FileManager.default
let projectDirectory = URL(fileURLWithPath: fileManager.currentDirectoryPath)
let photoDirectory = projectDirectory.appendingPathComponent("assets/photos", isDirectory: true)
let outputURL = photoDirectory.appendingPathComponent("steiner-family-tree-panorama.jpeg")
let separatorWidth = 14

let photoURLs = (1...4).map {
    photoDirectory.appendingPathComponent("tree_steiner_\($0).jpeg")
}

let images = try photoURLs.map { url -> CGImage in
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw NSError(
            domain: "SteinerFamilyTreeStitcher",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Could not read photo at \(url.path)"]
        )
    }
    return image
}

guard let imageHeight = images.map(\.height).max() else {
    fatalError("No source photos were found.")
}

let imageWidth = images.reduce(0) { $0 + $1.width }
let canvasWidth = imageWidth + separatorWidth * (images.count - 1)
guard let graphics = CGContext(
    data: nil,
    width: canvasWidth,
    height: imageHeight,
    bitsPerComponent: 8,
    bytesPerRow: canvasWidth * 4,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
    fatalError("Could not create the panorama canvas.")
}

graphics.setFillColor(CGColor(srgbRed: 0.94, green: 0.92, blue: 0.87, alpha: 1))
graphics.fill(CGRect(x: 0, y: 0, width: canvasWidth, height: imageHeight))
graphics.interpolationQuality = .high

var xOffset = 0
for image in images {
    graphics.draw(image, in: CGRect(x: xOffset, y: 0, width: image.width, height: image.height))
    xOffset += image.width + separatorWidth
}

guard let panorama = graphics.makeImage(),
      let destination = CGImageDestinationCreateWithURL(
        outputURL as CFURL,
        UTType.jpeg.identifier as CFString,
        1,
        nil
      ) else {
    fatalError("Could not encode the panorama as a JPEG.")
}
CGImageDestinationAddImage(
    destination,
    panorama,
    [kCGImageDestinationLossyCompressionQuality: 0.95] as CFDictionary
)
guard CGImageDestinationFinalize(destination) else {
    fatalError("Could not save the panorama.")
}

print("Saved \(images.count) complete photos, left to right, as \(outputURL.path)")
print("Panorama dimensions: \(canvasWidth) × \(imageHeight)")
