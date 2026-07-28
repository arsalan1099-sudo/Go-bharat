import { Category, SubCategory, Vendor, Product, Coupon, VendorApplication } from "./types";

export const categories: Category[] = [
  { id: "1", name: "B2B", icon: "briefcase-outline", color: "#3B82F6" },
  { id: "2", name: "B2C", icon: "storefront-outline", color: "#FF6B00" },
  { id: "3", name: "Service", icon: "build-outline", color: "#8B5CF6" },
  { id: "4", name: "Manpower", icon: "people-outline", color: "#10B981" },
  { id: "5", name: "Travel", icon: "bus-outline", color: "#E11D48" },
];

export const subCategories: SubCategory[] = [
  { id: "sc1", categoryId: "1", name: "Wholesale Grocery", icon: "cart", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400" },
  { id: "sc2", categoryId: "1", name: "Industrial Supplies", icon: "hardware-chip", image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400" },
  { id: "sc3", categoryId: "1", name: "Office Equipment", icon: "desktop", image: "https://images.unsplash.com/photo-1468495244123-6c6c332eeece?w=400" },
  { id: "sc4", categoryId: "1", name: "Raw Materials", icon: "cube", image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400" },

  { id: "sc5", categoryId: "2", name: "Food & Dining", icon: "restaurant", image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400" },
  { id: "sc6", categoryId: "2", name: "Fashion & Lifestyle", icon: "shirt", image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400" },
  { id: "sc7", categoryId: "2", name: "Electronics & Gadgets", icon: "phone-portrait", image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400" },
  { id: "sc8", categoryId: "2", name: "Health & Beauty", icon: "sparkles", image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400" },
  { id: "sc9", categoryId: "2", name: "Grocery & Daily Needs", icon: "basket", image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400" },
  { id: "sc10", categoryId: "2", name: "Home & Living", icon: "home", image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400" },

  { id: "sc11", categoryId: "3", name: "Home Services", icon: "home", image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400" },
  { id: "sc12", categoryId: "3", name: "Beauty & Wellness", icon: "sparkles", image: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400" },
  { id: "sc13", categoryId: "3", name: "Repair & Maintenance", icon: "build", image: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400" },
  { id: "sc14", categoryId: "3", name: "Professional Services", icon: "briefcase", image: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400" },

  { id: "sc15", categoryId: "4", name: "Delivery Partners", icon: "bicycle", image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400" },
  { id: "sc16", categoryId: "4", name: "Skilled Workers", icon: "hammer", image: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400" },
  { id: "sc17", categoryId: "4", name: "Domestic Help", icon: "person", image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400" },
  { id: "sc18", categoryId: "4", name: "Event Staff", icon: "calendar", image: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400" },

  { id: "sc19", categoryId: "1", name: "Packaging Materials", icon: "cube", image: "https://images.unsplash.com/photo-1567337710282-00832b415979?w=400" },
  { id: "sc20", categoryId: "1", name: "Chemical Supplies", icon: "flask", image: "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400" },
  { id: "sc21", categoryId: "1", name: "Textile Raw Materials", icon: "shirt", image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400" },
  { id: "sc22", categoryId: "1", name: "Agricultural Inputs", icon: "leaf", image: "https://images.unsplash.com/photo-1491933382434-500287f9b54b?w=400" },
  { id: "sc23", categoryId: "1", name: "Construction Materials", icon: "construct", image: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400" },
  { id: "sc24", categoryId: "1", name: "Auto Parts Wholesale", icon: "car", image: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=400" },
  { id: "sc25", categoryId: "1", name: "Paper & Printing", icon: "document", image: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=400" },
  { id: "sc26", categoryId: "1", name: "Electrical Components", icon: "flash", image: "https://images.unsplash.com/photo-1585515320310-259814833e62?w=400" },
  { id: "sc27", categoryId: "1", name: "Plumbing Supplies Wholesale", icon: "water", image: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=400" },
  { id: "sc28", categoryId: "1", name: "Safety Equipment", icon: "shield-checkmark", image: "https://images.unsplash.com/photo-1561136594-7f68413baa99?w=400" },
  { id: "sc29", categoryId: "1", name: "Restaurant Supplies", icon: "restaurant", image: "https://images.unsplash.com/photo-1508313880080-c4bef0730395?w=400" },
  { id: "sc30", categoryId: "1", name: "Medical Equipment", icon: "medkit", image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400" },
  { id: "sc31", categoryId: "1", name: "IT Equipment Bulk", icon: "laptop", image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=400" },
  { id: "sc32", categoryId: "1", name: "Furniture Wholesale", icon: "grid", image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400" },
  { id: "sc33", categoryId: "1", name: "Cleaning Supplies", icon: "sparkles", image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400" },
  { id: "sc34", categoryId: "1", name: "Handicraft Materials", icon: "color-palette", image: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400" },
  { id: "sc35", categoryId: "1", name: "Steel & Metal", icon: "hammer", image: "https://images.unsplash.com/photo-1630383249896-424e482df921?w=400" },
  { id: "sc36", categoryId: "1", name: "Plastic Products", icon: "layers", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400" },
  { id: "sc37", categoryId: "1", name: "Timber & Wood", icon: "albums", image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400" },
  { id: "sc38", categoryId: "1", name: "Gems & Jewelry Wholesale", icon: "diamond", image: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400" },
  { id: "sc39", categoryId: "1", name: "Stationery Wholesale", icon: "pencil", image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400" },
  { id: "sc40", categoryId: "1", name: "FMCG Distribution", icon: "storefront", image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=400" },
  { id: "sc41", categoryId: "1", name: "Pharma Wholesale", icon: "bandage", image: "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400" },
  { id: "sc42", categoryId: "1", name: "Building Hardware", icon: "build", image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400" },
  { id: "sc43", categoryId: "1", name: "Tools & Machinery", icon: "settings", image: "https://images.unsplash.com/photo-1584483766114-2cea6facdf57?w=400" },

  { id: "sc44", categoryId: "2", name: "Bakery & Sweets", icon: "cafe", image: "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400" },
  { id: "sc45", categoryId: "2", name: "Footwear", icon: "bag-handle", image: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400" },
  { id: "sc46", categoryId: "2", name: "Toys & Games", icon: "game-controller", image: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=400" },
  { id: "sc47", categoryId: "2", name: "Books & Stationery", icon: "book", image: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=400" },
  { id: "sc48", categoryId: "2", name: "Sports & Fitness", icon: "fitness", image: "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=400" },
  { id: "sc49", categoryId: "2", name: "Pet Supplies", icon: "paw", image: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400" },
  { id: "sc50", categoryId: "2", name: "Flowers & Gifts", icon: "flower", image: "https://images.unsplash.com/photo-1531346878377-a5be20888e57?w=400" },
  { id: "sc51", categoryId: "2", name: "Watches & Accessories", icon: "watch", image: "https://images.unsplash.com/photo-1585336261022-680e295ce3fe?w=400" },
  { id: "sc52", categoryId: "2", name: "Baby & Kids", icon: "people", image: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400" },
  { id: "sc53", categoryId: "2", name: "Eyewear", icon: "glasses", image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400" },
  { id: "sc54", categoryId: "2", name: "Luggage & Bags", icon: "briefcase", image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400" },
  { id: "sc55", categoryId: "2", name: "Musical Instruments", icon: "musical-notes", image: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400" },
  { id: "sc56", categoryId: "2", name: "Art & Craft", icon: "brush", image: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400" },
  { id: "sc57", categoryId: "2", name: "Mobile Accessories", icon: "phone-portrait", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400" },
  { id: "sc58", categoryId: "2", name: "Organic & Natural", icon: "leaf", image: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400" },
  { id: "sc59", categoryId: "2", name: "Dry Fruits & Nuts", icon: "basket", image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=400" },
  { id: "sc60", categoryId: "2", name: "Kitchen Appliances", icon: "bulb", image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=400" },
  { id: "sc61", categoryId: "2", name: "Jewelry & Ornaments", icon: "diamond", image: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400" },
  { id: "sc62", categoryId: "2", name: "Auto Accessories", icon: "car", image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400" },
  { id: "sc63", categoryId: "2", name: "Paan & Tobacco", icon: "leaf", image: "https://images.unsplash.com/photo-1583119022894-919a68a3d0e3?w=400" },
  { id: "sc64", categoryId: "2", name: "Snacks & Beverages", icon: "fast-food", image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400" },
  { id: "sc65", categoryId: "2", name: "Traditional Wear", icon: "shirt", image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400" },
  { id: "sc66", categoryId: "2", name: "Pooja Items", icon: "bonfire", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400" },
  { id: "sc67", categoryId: "2", name: "Gift Articles", icon: "gift", image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=400" },
  { id: "sc68", categoryId: "2", name: "Personal Care", icon: "heart", image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=400" },

  { id: "sc69", categoryId: "3", name: "Cleaning Services", icon: "sparkles", image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400" },
  { id: "sc70", categoryId: "3", name: "Pest Control", icon: "shield-checkmark", image: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=400" },
  { id: "sc71", categoryId: "3", name: "Interior Design", icon: "color-palette", image: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=400" },
  { id: "sc72", categoryId: "3", name: "Photography", icon: "camera", image: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400" },
  { id: "sc73", categoryId: "3", name: "Catering Services", icon: "restaurant", image: "https://images.unsplash.com/photo-1497215842964-222b430dc094?w=400" },
  { id: "sc74", categoryId: "3", name: "Tutoring & Coaching", icon: "school", image: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=400" },
  { id: "sc75", categoryId: "3", name: "Fitness Training", icon: "fitness", image: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400" },
  { id: "sc76", categoryId: "3", name: "Astrology & Pooja", icon: "star", image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400" },
  { id: "sc77", categoryId: "3", name: "Travel & Tourism", icon: "airplane", image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400" },
  { id: "sc78", categoryId: "3", name: "Event Management", icon: "calendar", image: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=400" },
  { id: "sc79", categoryId: "3", name: "Legal Services", icon: "document", image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400" },
  { id: "sc80", categoryId: "3", name: "Accounting & Tax", icon: "calculator", image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400" },
  { id: "sc81", categoryId: "3", name: "Healthcare Services", icon: "medkit", image: "https://images.unsplash.com/photo-1573164713988-8665fc963095?w=400" },
  { id: "sc82", categoryId: "3", name: "Pet Care", icon: "paw", image: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400" },
  { id: "sc83", categoryId: "3", name: "Courier & Logistics", icon: "bicycle", image: "https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=400" },
  { id: "sc84", categoryId: "3", name: "Car Wash & Detailing", icon: "car", image: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400" },
  { id: "sc85", categoryId: "3", name: "Tailoring & Alteration", icon: "shirt", image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400" },
  { id: "sc86", categoryId: "3", name: "Printing & Signage", icon: "newspaper", image: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400" },
  { id: "sc87", categoryId: "3", name: "IT Support", icon: "laptop", image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400" },
  { id: "sc88", categoryId: "3", name: "Insurance & Finance", icon: "cash", image: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400" },

  { id: "sc89", categoryId: "4", name: "Security Guards", icon: "shield-checkmark", image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400" },
  { id: "sc90", categoryId: "4", name: "Drivers & Chauffeurs", icon: "car", image: "https://images.unsplash.com/photo-1557862921-37829c790f19?w=400" },
  { id: "sc91", categoryId: "4", name: "Cooks & Chefs", icon: "restaurant", image: "https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400" },
  { id: "sc92", categoryId: "4", name: "Warehouse Staff", icon: "cube", image: "https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=400" },
  { id: "sc93", categoryId: "4", name: "Construction Labour", icon: "construct", image: "https://images.unsplash.com/photo-1550831107-1553da8c8464?w=400" },
  { id: "sc94", categoryId: "4", name: "Factory Workers", icon: "settings", image: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400" },
  { id: "sc95", categoryId: "4", name: "Office Support Staff", icon: "briefcase", image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400" },
  { id: "sc96", categoryId: "4", name: "AC & Refrigeration Tech", icon: "thermometer", image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=400" },
  { id: "sc97", categoryId: "4", name: "Welders & Fabricators", icon: "flash", image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400" },
  { id: "sc98", categoryId: "4", name: "Data Entry & Back Office", icon: "desktop", image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=400" },
  { id: "sc99", categoryId: "4", name: "Sales & Promoters", icon: "trending-up", image: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400" },
  { id: "sc100", categoryId: "4", name: "Packing & Logistics", icon: "archive", image: "https://images.unsplash.com/photo-1590650153855-d9e808231d41?w=400" },

  { id: "sc101", categoryId: "5", name: "Bus Booking", icon: "bus", image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400" },
  { id: "sc102", categoryId: "5", name: "Cab & Taxi", icon: "car", image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400" },
  { id: "sc103", categoryId: "5", name: "Tour Packages", icon: "map", image: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400" },
  { id: "sc104", categoryId: "5", name: "Hotel Booking", icon: "bed", image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400" },
  { id: "sc105", categoryId: "5", name: "Tempo & Traveller", icon: "bus", image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=400" },
  { id: "sc106", categoryId: "5", name: "Pilgrimage Tours", icon: "navigate", image: "https://images.unsplash.com/photo-1548013146-72479768bada?w=400" },
  { id: "sc107", categoryId: "5", name: "Flight Booking", icon: "airplane", image: "https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=400" },
  { id: "sc108", categoryId: "5", name: "Train Ticket", icon: "train", image: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=400" },
  { id: "sc109", categoryId: "5", name: "Truck & Logistics", icon: "cube", image: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400" },
];

export const vendors: Vendor[] = [
  {
    id: "v_travel_1",
    name: "Bharat Travels",
    description: "Premium bus services across Maharashtra. AC sleeper, semi-sleeper & seater buses for all major routes.",
    image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600",
    rating: 4.5,
    reviewCount: 312,
    deliveryTime: "On-Time",
    distance: "0.5 km",
    isOpen: true,
    categoryId: "5",
    subCategoryId: "sc101",
    commissionRate: 8,
    lat: 20.5579,
    lng: 74.5089,
    address: "Malegaon Bus Stand, Malegaon, Maharashtra",
    codEnabled: false,
  },
  {
    id: "v_flight_1",
    name: "GoFly Air Services",
    description: "Book domestic & international flights at the best fares. Economy, Business and First Class available.",
    image: "https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=600",
    rating: 4.7,
    reviewCount: 189,
    deliveryTime: "Instant E-Ticket",
    distance: "Online",
    isOpen: true,
    categoryId: "5",
    subCategoryId: "sc107",
    commissionRate: 5,
    lat: 20.5579,
    lng: 74.5089,
    address: "Online Booking",
    codEnabled: false,
  },
  {
    id: "v_train_1",
    name: "Rail Connect",
    description: "Fast and easy train ticket booking for all classes. Sleeper, 3A, 2A, and 1AC berths available.",
    image: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=600",
    rating: 4.3,
    reviewCount: 254,
    deliveryTime: "Instant E-Ticket",
    distance: "Online",
    isOpen: true,
    categoryId: "5",
    subCategoryId: "sc108",
    commissionRate: 4,
    lat: 20.5579,
    lng: 74.5089,
    address: "Online Booking",
    codEnabled: false,
  },
  {
    id: "v_cab_1",
    name: "City Cab Service",
    description: "Reliable cab & taxi services across town. Auto, Hatchback, Sedan, SUV available 24/7.",
    image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=600",
    rating: 4.4,
    reviewCount: 178,
    deliveryTime: "5-15 min",
    distance: "1.2 km",
    isOpen: true,
    categoryId: "5",
    subCategoryId: "sc102",
    commissionRate: 10,
    lat: 20.5579,
    lng: 74.5089,
    address: "Malegaon, Maharashtra",
    codEnabled: true,
  },
  {
    id: "v_tempo_1",
    name: "Malegaon Tempo Traveller",
    description: "Book 9-seater, 12-seater, and 17-seater tempo travellers for tours, pilgrimages & group travel.",
    image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=600",
    rating: 4.2,
    reviewCount: 94,
    deliveryTime: "As per booking",
    distance: "2.0 km",
    isOpen: true,
    categoryId: "5",
    subCategoryId: "sc105",
    commissionRate: 8,
    lat: 20.5579,
    lng: 74.5089,
    address: "Malegaon, Maharashtra",
    codEnabled: true,
  },
];

export const products: Product[] = [
  { id: "bus1", vendorId: "v_travel_1", name: "Malegaon → Mumbai", description: "AC Sleeper | Shivneri Deluxe | 6 hrs | Departs 6:00 AM", price: 650, image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400", isAvailable: true, category: "Bus Booking" },
  { id: "bus2", vendorId: "v_travel_1", name: "Malegaon → Pune", description: "AC Semi-Sleeper | Ashwamedh | 5 hrs | Departs 8:00 AM", price: 550, image: "https://images.unsplash.com/photo-1494515843206-f3117d3f51b7?w=400", isAvailable: true, category: "Bus Booking" },
  { id: "bus3", vendorId: "v_travel_1", name: "Malegaon → Nashik", description: "Non-AC Seater | Nashik Express | 2 hrs | Departs 7:30 AM", price: 180, image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=400", isAvailable: true, category: "Bus Booking" },
  { id: "bus4", vendorId: "v_travel_1", name: "Malegaon → Nagpur", description: "AC Sleeper | Vidarbha Express | 10 hrs | Departs 9:00 PM", price: 950, image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400", isAvailable: true, category: "Bus Booking" },
  { id: "bus5", vendorId: "v_travel_1", name: "Malegaon → Aurangabad", description: "AC Semi-Sleeper | Marathwada Superfast | 4 hrs | Departs 6:30 AM", price: 450, image: "https://images.unsplash.com/photo-1494515843206-f3117d3f51b7?w=400", isAvailable: true, category: "Bus Booking" },
  { id: "bus6", vendorId: "v_travel_1", name: "Malegaon → Shirdi", description: "Non-AC Seater | Pilgrim Special | 3 hrs | Departs 5:00 AM", price: 220, image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=400", isAvailable: true, category: "Bus Booking" },
  { id: "bus7", vendorId: "v_travel_1", name: "Malegaon → Dhule", description: "Non-AC Seater | Local Shuttle | 1.5 hrs | Every Hour", price: 120, image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400", isAvailable: true, category: "Bus Booking" },
  { id: "bus8", vendorId: "v_travel_1", name: "Malegaon → Jalgaon", description: "AC Seater | Khandesh Express | 3 hrs | Departs 10:00 AM", price: 350, image: "https://images.unsplash.com/photo-1494515843206-f3117d3f51b7?w=400", isAvailable: true, category: "Bus Booking" },
  { id: "flight1", vendorId: "v_flight_1", name: "Mumbai → Delhi", description: "Daily departures | 2 hrs 15 min | GoAir, IndiGo, Air India", price: 3499, originalPrice: 4800, image: "https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=400", isAvailable: true, category: "Flight Booking" },
  { id: "flight2", vendorId: "v_flight_1", name: "Mumbai → Bengaluru", description: "Daily departures | 1 hr 45 min | IndiGo, SpiceJet, Vistara", price: 2799, originalPrice: 3900, image: "https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=400", isAvailable: true, category: "Flight Booking" },
  { id: "flight3", vendorId: "v_flight_1", name: "Mumbai → Hyderabad", description: "Daily departures | 1 hr 30 min | IndiGo, Air India", price: 2499, image: "https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=400", isAvailable: true, category: "Flight Booking" },
  { id: "flight4", vendorId: "v_flight_1", name: "Mumbai → Kolkata", description: "Daily departures | 2 hrs 45 min | GoAir, Vistara", price: 4199, originalPrice: 5500, image: "https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=400", isAvailable: true, category: "Flight Booking" },
  { id: "flight5", vendorId: "v_flight_1", name: "Mumbai → Chennai", description: "Daily departures | 2 hrs | IndiGo, SpiceJet", price: 3199, image: "https://images.unsplash.com/photo-1529074963764-98f45c47344b?w=400", isAvailable: true, category: "Flight Booking" },
  { id: "train1", vendorId: "v_train_1", name: "Malegaon → Mumbai CST", description: "Panchvati Express | Daily | Departs 6:15 AM | 7 hrs 30 min", price: 320, originalPrice: 420, image: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=400", isAvailable: true, category: "Train Ticket" },
  { id: "train2", vendorId: "v_train_1", name: "Malegaon → Pune", description: "Nashik Road–Pune Express | Departs 8:00 AM | 6 hrs", price: 280, image: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=400", isAvailable: true, category: "Train Ticket" },
  { id: "train3", vendorId: "v_train_1", name: "Malegaon → Nagpur", description: "Devagiri Express | Departs 10:30 PM | 8 hrs 30 min", price: 450, originalPrice: 580, image: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?w=400", isAvailable: true, category: "Train Ticket" },
  { id: "cab_auto", vendorId: "v_cab_1", name: "Auto Rickshaw", description: "Best for short distances within city. Fits 2-3 passengers.", price: 50, image: "https://images.unsplash.com/photo-1555169062-013468b47731?w=400", isAvailable: true, category: "Cab & Taxi" },
  { id: "cab_mini", vendorId: "v_cab_1", name: "Mini (Hatchback)", description: "Alto, WagonR. Fits 4 passengers. AC/Non-AC available.", price: 150, image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400", isAvailable: true, category: "Cab & Taxi" },
  { id: "cab_sedan", vendorId: "v_cab_1", name: "Sedan (Dzire / Etios)", description: "Comfortable for up to 4 passengers. AC standard.", price: 220, image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400", isAvailable: true, category: "Cab & Taxi" },
  { id: "cab_suv", vendorId: "v_cab_1", name: "SUV (Ertiga / Innova)", description: "Spacious cab for 6-7 passengers. AC standard.", price: 350, image: "https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=400", isAvailable: true, category: "Cab & Taxi" },
  { id: "tempo_9", vendorId: "v_tempo_1", name: "9-Seater Tempo", description: "Ideal for family trips & small group travel. AC/Non-AC.", price: 2500, image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=400", isAvailable: true, category: "Tempo & Traveller" },
  { id: "tempo_12", vendorId: "v_tempo_1", name: "12-Seater Traveller", description: "Perfect for medium groups, pilgrimages & events. AC.", price: 3500, image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=400", isAvailable: true, category: "Tempo & Traveller" },
  { id: "tempo_17", vendorId: "v_tempo_1", name: "17-Seater Traveller", description: "Large group travel for tours, weddings & corporate events.", price: 4800, image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=400", isAvailable: true, category: "Tempo & Traveller" },
];

export const coupons: Coupon[] = [
  { id: "c1", code: "FIRST50", discountType: "PERCENTAGE", value: 50, minOrder: 200, expiresAt: "2026-12-31" },
  { id: "c2", code: "SAVE100", discountType: "FLAT", value: 100, minOrder: 500, expiresAt: "2026-06-30" },
  { id: "c3", code: "GOBHARAT", discountType: "PERCENTAGE", value: 20, minOrder: 300, expiresAt: "2026-03-31" },
  { id: "c4", code: "FRESH25", discountType: "PERCENTAGE", value: 25, minOrder: 150, expiresAt: "2026-09-30" },
  { id: "c5", code: "FLAT200", discountType: "FLAT", value: 200, minOrder: 999, expiresAt: "2026-08-15" },
];

export const banners = [
  { id: "b1", title: "Flat 50% Off", subtitle: "On your first order", color: "#FF6B00" },
  { id: "b2", title: "Free Delivery", subtitle: "Orders above 299", color: "#0B1E3D" },
  { id: "b3", title: "Festival Sale", subtitle: "Up to 70% off on fashion", color: "#8B5CF6" },
  { id: "b4", title: "Grocery Special", subtitle: "Fresh veggies at best prices", color: "#10B981" },
  { id: "b5", title: "Electronics Deals", subtitle: "Smart gadgets under 2999", color: "#3B82F6" },
];

export const sampleVendorApplications: VendorApplication[] = [];

export interface BusRoute {
  id: string;
  productId: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  duration: string;
  busType: "AC Sleeper" | "AC Semi-Sleeper" | "AC Seater" | "Non-AC Seater";
  busName: string;
  totalSeats: number;
  bookedSeats: number[];
  pricePerSeat: number;
  amenities: string[];
  stops: string[];
}

export const TRAVEL_VENDOR_ID = "v_travel_1";
export const FLIGHT_VENDOR_IDS = ["v_flight_1", "v_flight_2"];
export const TRAIN_VENDOR_IDS = ["v_train_1", "v_train_2"];

export const busRoutes: BusRoute[] = [
  { id: "br1", productId: "bus1", from: "Malegaon", to: "Mumbai", departure: "6:00 AM", arrival: "12:00 PM", duration: "6 hrs", busType: "AC Sleeper", busName: "Shivneri Deluxe", totalSeats: 36, bookedSeats: [1,2,5,8,12,15,18,22,25,30], pricePerSeat: 650, amenities: ["AC", "Blanket", "Water Bottle", "Charging Point", "WiFi"], stops: ["Malegaon", "Satana", "Nashik", "Igatpuri", "Kasara", "Thane", "Mumbai"] },
  { id: "br2", productId: "bus2", from: "Malegaon", to: "Pune", departure: "8:00 AM", arrival: "1:00 PM", duration: "5 hrs", busType: "AC Semi-Sleeper", busName: "Ashwamedh", totalSeats: 40, bookedSeats: [3,7,11,14,19,23,27,33,37], pricePerSeat: 550, amenities: ["AC", "Water Bottle", "Charging Point"], stops: ["Malegaon", "Satana", "Nashik", "Sinnar", "Ahmednagar", "Pune"] },
  { id: "br3", productId: "bus3", from: "Malegaon", to: "Nashik", departure: "7:30 AM", arrival: "9:30 AM", duration: "2 hrs", busType: "Non-AC Seater", busName: "Nashik Express", totalSeats: 48, bookedSeats: [2,4,10,16,20,28,34,40,45], pricePerSeat: 180, amenities: ["Fan", "Water Bottle"], stops: ["Malegaon", "Satana", "Nashik"] },
  { id: "br4", productId: "bus4", from: "Malegaon", to: "Nagpur", departure: "9:00 PM", arrival: "7:00 AM", duration: "10 hrs", busType: "AC Sleeper", busName: "Vidarbha Express", totalSeats: 36, bookedSeats: [1,6,9,13,17,21,26,31,35], pricePerSeat: 950, amenities: ["AC", "Blanket", "Pillow", "Water Bottle", "Charging Point", "Curtain"], stops: ["Malegaon", "Dhule", "Jalgaon", "Buldhana", "Akola", "Amravati", "Nagpur"] },
  { id: "br5", productId: "bus5", from: "Malegaon", to: "Aurangabad", departure: "6:30 AM", arrival: "10:30 AM", duration: "4 hrs", busType: "AC Semi-Sleeper", busName: "Marathwada Superfast", totalSeats: 40, bookedSeats: [5,8,12,20,24,30,36], pricePerSeat: 450, amenities: ["AC", "Water Bottle", "Charging Point"], stops: ["Malegaon", "Satana", "Yeola", "Aurangabad"] },
  { id: "br6", productId: "bus6", from: "Malegaon", to: "Shirdi", departure: "5:00 AM", arrival: "8:00 AM", duration: "3 hrs", busType: "Non-AC Seater", busName: "Pilgrim Special", totalSeats: 48, bookedSeats: [1,3,7,9,15,21,25,33,41,47], pricePerSeat: 220, amenities: ["Fan", "Water Bottle"], stops: ["Malegaon", "Yeola", "Rahata", "Shirdi"] },
  { id: "br7", productId: "bus7", from: "Malegaon", to: "Dhule", departure: "Every Hour", arrival: "~1.5 hrs", duration: "1.5 hrs", busType: "Non-AC Seater", busName: "Local Shuttle", totalSeats: 48, bookedSeats: [2,6,14,22,38], pricePerSeat: 120, amenities: ["Fan"], stops: ["Malegaon", "Dhule"] },
  { id: "br8", productId: "bus8", from: "Malegaon", to: "Jalgaon", departure: "10:00 AM", arrival: "1:00 PM", duration: "3 hrs", busType: "AC Seater", busName: "Khandesh Express", totalSeats: 44, bookedSeats: [4,8,15,20,28,35,42], pricePerSeat: 350, amenities: ["AC", "Water Bottle", "Charging Point"], stops: ["Malegaon", "Dhule", "Jalgaon"] },
];

