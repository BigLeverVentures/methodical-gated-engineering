/// Small summary statistics.
public enum Tally {
    /// The sum of values.
    public static func total(_ values: [Double]) -> Double {
        values.reduce(0, +)
    }
}
